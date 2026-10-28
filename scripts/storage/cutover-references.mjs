process.on("SIGINT", () => {});
import { loadCutoverConfig } from "./cutover-config.mjs";
import pg from 'pg';
import { readFile, writeFile, readdir, open } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip, createGunzip } from 'node:zlib';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createConnection } from 'node:net';
import { createReferenceRewriter, restoreReferenceValue, referenceHash } from './reference-rewrite.mjs';

const config=await loadCutoverConfig();
const evidence=config.evidenceDir;
const destination=config.frozenBackupDir;
const allowedTables=['canvas_node_runs','canvas_runs','canvas_schedules','canvas_subtitle_revisions','canvas_workflows',
  'content_projects','feishu_publish_queue','generated_posts','library_assets','original_batch_items','runtime_posts','simple_runs'];
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const etag=s=>String(s||'').replace(/^"|"$/g,'');
async function requireOffline(){
  const listening=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:3001});
    s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',e=>{s.destroy();resolve(e.code!=='ECONNREFUSED')});s.setTimeout(1500,()=>{s.destroy();resolve(true)});});
  if(listening)throw new Error('Port3001MustBeStopped');
}
async function verifiedKeys(){
  const inv=await readJson(`${evidence}/inventory.json`);
  if(Date.now()-Date.parse(inv.end)>30*60*1000)throw new Error('InventoryTooOld');
  const source=new Map(inv.source.map(x=>[x.key,x]));const target=new Map(inv.target.map(x=>[x.key,x]));
  const original=await readJson(`${evidence}/reported.json`);
  const earlier=new Map((await readJson(`${evidence}/inventory-stage-a.json`)).target.map(x=>[x.key,x]));
  const keys=new Set();
  for(const x of original){const s=source.get(x.key),t=target.get(x.key),old=earlier.get(x.key);
    if(s&&t&&old&&s.size===x.size&&t.size===x.size&&Date.parse(s.modified)===Date.parse(x.modified)&&etag(old.etag)===etag(t.etag))keys.add(x.key);}
  for(const entry of await readdir(evidence,{withFileTypes:true})){
    if(!entry.isDirectory()||!entry.name.startsWith('delta-'))continue;
    const dir=`${evidence}/${entry.name}`;const summary=await readJson(`${dir}/summary.json`);
    if(summary.status!=='verified')continue;
    const lines=(await readFile(`${dir}/journal.ndjson`,'utf8')).trim().split('\n');
    for(const line of lines){const r=JSON.parse(line);if(r.state!=='verified'||r.sourceSha256!==r.targetSha256)continue;
      const s=source.get(r.key),t=target.get(r.key);
      if(s&&t&&s.size===r.size&&t.size===r.size&&etag(s.etag)===etag(r.sourceEtag)&&etag(t.etag)===etag(r.targetEtag)&&Date.parse(s.modified)===Date.parse(r.sourceModified))keys.add(r.key);}
  }
  if(keys.size<71400||keys.size>100000)throw new Error('VerifiedScopeUnexpected');
  return {keys,inventoryAt:inv.end};
}

async function run(){
 const mode=process.argv[2];
 if(!['--dry-run','--apply','--rollback','--self-test'].includes(mode))throw new Error('ExplicitModeRequired');
 const url=mode==='--dry-run'?process.env.FLUXPOST_DIAG_DATABASE_URL:process.env.DATABASE_URL;
 if(!url||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw new Error('LocalDatabaseOnly');
 const client=new pg.Client({connectionString:url,connectionTimeoutMillis:10000,statement_timeout:60000});
 let gzip,output;
 try{
  await client.connect();
  if(mode==='--self-test'){
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE oss_rewrite_fixture (id text primary key, data_json jsonb) ON COMMIT DROP');
    const raw='{"url":"https://source.example/scope/a.jpg","large":18446744073709551615,"small":0.000000000000000001,"status":"completed","existing":"https://target.example/scope/a.jpg"}';
    await client.query('INSERT INTO oss_rewrite_fixture VALUES ($1,$2::jsonb)',['fixture',raw]);
    const before=(await client.query('SELECT data_json::text value FROM oss_rewrite_fixture')).rows[0].value;
    const rewrite=createReferenceRewriter({sourceOrigin:'https://source.example',targetOrigin:'https://target.example',prefix:'scope/',verifiedKeys:new Set(['scope/a.jpg'])});
    const mapped=rewrite(before);
    const result=await client.query('UPDATE oss_rewrite_fixture SET data_json=$1::jsonb WHERE id=$2 AND data_json::text=$3 RETURNING data_json::text value',[mapped.value,'fixture',before]);
    if(result.rowCount!==1||referenceHash(result.rows[0].value)!==mapped.afterHash)throw new Error('FixtureWriteMismatch');
    const restored=restoreReferenceValue(result.rows[0].value,mapped);
    if(restored!==before)throw new Error('FixtureRollbackMismatch');
    await client.query('UPDATE oss_rewrite_fixture SET data_json=$1::jsonb',[restored]);
    if((await client.query('SELECT data_json::text value FROM oss_rewrite_fixture')).rows[0].value!==before)throw new Error('FixtureRestoreMismatch');
    await client.query('ROLLBACK');console.log('PostgreSQL TEMP fixture: numeric precision, conditional rewrite, persisted hash and exact rollback passed.');return;
  }
  if(mode!=='--dry-run')await requireOffline();
  await client.query(mode==='--dry-run'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query("SET LOCAL lock_timeout='3s'");
  if(mode!=='--dry-run')for(const t of [...allowedTables].sort())await client.query(`LOCK TABLE public.${ident(t)} IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
  if(mode==='--rollback'){
    const meta=await readJson(`${destination}/rewrite-summary.json`);
    if(meta.status!=='committed')throw new Error('CommittedReceiptRequired');
    const input=createReadStream(`${destination}/reference-undo.ndjson.gz`).pipe(createGunzip());
    let cells=0;
    for await(const line of createInterface({input,crlfDelay:Infinity})){
      const r=JSON.parse(line);if(!allowedTables.includes(r.table))throw new Error('ReceiptTableRejected');
      const current=(await client.query(`SELECT ${ident(r.column)}::text value FROM public.${ident(r.table)} WHERE id=$1`,[r.id])).rows[0]?.value;
      if(typeof current!=='string')throw new Error('RollbackRowMissing');
      const value=restoreReferenceValue(current,r);
      const result=await client.query(`UPDATE public.${ident(r.table)} SET ${ident(r.column)}=$1::${r.json?'jsonb':'text'} WHERE id=$2 AND ${ident(r.column)}::text=$3`,[value,r.id,current]);
      if(result.rowCount!==1)throw new Error('RollbackConflict');cells++;
    }
    await client.query('COMMIT');await writeFile(`${destination}/rollback-result.json`,JSON.stringify({cells,at:new Date().toISOString()}));console.log(JSON.stringify({rolledBackCells:cells}));return;
  }
  const {keys,inventoryAt}=await verifiedKeys();
  const base=process.env.TOS_PUBLIC_BASE_URL;
  const sourceOrigin=new URL(base.includes('://')?base:`https://${base}`).origin;
  const rewrite=createReferenceRewriter({sourceOrigin,targetOrigin:'https://xpai-imc.oss-cn-guangzhou.aliyuncs.com',prefix:'fluxpost/flux-lightmoment/',verifiedKeys:keys});
  const summary={mode,status:'running',startedAt:new Date().toISOString(),inventoryAt,verifiedKeys:keys.size,changedRows:0,changedCells:0,changedStringValues:0,byTable:{}};
  if(mode==='--apply'){
    const backup=await readJson(`${destination}/receipt.json`);
    if(!backup.archiveDecodePassed||!backup.cutoverFrozen)throw new Error('FrozenBackupRequired');
    gzip=createGzip({level:6});output=createWriteStream(`${destination}/reference-undo.ndjson.gz`,{flags:'wx',mode:0o600});gzip.pipe(output);
  }
  const schema=(await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) AND data_type IN ('text','jsonb') ORDER BY table_name,ordinal_position",[allowedTables])).rows;
  for(const t of allowedTables){
    const cols=schema.filter(x=>x.table_name===t&&['public_url','data_json'].includes(x.column_name));
    if(!cols.length)throw new Error('SchemaMismatch');
    await client.query(`DECLARE scan_refs NO SCROLL CURSOR FOR SELECT id,${cols.map(x=>`${ident(x.column_name)}::text AS ${ident(x.column_name)}`).join(',')} FROM public.${ident(t)} WHERE ${cols.map(x=>`strpos(${ident(x.column_name)}::text,$1)>0`).join(' OR ')} ORDER BY id`,[new URL(sourceOrigin).hostname]);
    let changedRows=0,changedCells=0;
    while(true){
      const batch=await client.query('FETCH FORWARD 32 FROM scan_refs');if(!batch.rows.length)break;
      for(const row of batch.rows){let changed=false;
        for(const col of cols){const value=row[col.column_name];if(typeof value!=='string')continue;
          const json=col.data_type==='jsonb';const r=rewrite(value,json);if(!r.patches.length)continue;
          if(restoreReferenceValue(r.value,r)!==value)throw new Error('ReversePreflightFailed');
          if(mode==='--apply'){
            const receipt={table:t,id:row.id,column:col.column_name,json,beforeHash:r.beforeHash,afterHash:r.afterHash,patches:r.patches};
            if(!gzip.write(JSON.stringify(receipt)+'\n'))await once(gzip,'drain');
            const result=await client.query(`UPDATE public.${ident(t)} SET ${ident(col.column_name)}=$1::${json?'jsonb':'text'} WHERE id=$2 AND ${ident(col.column_name)}::text=$3 RETURNING ${ident(col.column_name)}::text value`,[r.value,row.id,value]);
            if(result.rowCount!==1||referenceHash(result.rows[0].value)!==r.afterHash)throw new Error('ConcurrentOrCanonicalChange');
          }
          changed=true;changedCells++;summary.changedStringValues+=r.patches.length;
        }
        if(changed)changedRows++;
      }
      if(changedRows && changedRows % 256 === 0) console.log(JSON.stringify({table:t,changedRows,changedCells}));
    }
    await client.query('CLOSE scan_refs');summary.byTable[t]={changedRows,changedCells};summary.changedRows+=changedRows;summary.changedCells+=changedCells;
    console.log(JSON.stringify({table:t,changedRows,changedCells}));
  }
  if(mode==='--apply'){
    gzip.end();await finished(output);const fd=await open(`${destination}/reference-undo.ndjson.gz`,'r+');await fd.sync();await fd.close();
    await writeFile(`${destination}/rewrite-precommit.json`,JSON.stringify(summary,null,2),{mode:0o600});
    await client.query('COMMIT');summary.status='committed';
  }else{await client.query('ROLLBACK');summary.status='dry-run';}
  summary.finishedAt=new Date().toISOString();
  await writeFile(mode==='--apply'?`${destination}/rewrite-summary.json`:`${evidence}/rewrite-dry-run.json`,JSON.stringify(summary,null,2),{mode:0o600});
  console.log(JSON.stringify(summary));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});gzip?.destroy();output?.destroy();console.error(JSON.stringify({code:e.code||e.name,reason:/^[A-Za-z]+$/.test(e.message)?e.message:undefined}));process.exitCode=1;}
 finally{await client.end();}
}
run().catch(e=>{console.error(JSON.stringify({code:e.code||e.name}));process.exitCode=1;});
