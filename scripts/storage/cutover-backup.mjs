process.on("SIGINT", () => {});
import { loadCutoverConfig } from "./cutover-config.mjs";
import { spawn } from 'node:child_process';
import { writeFile, stat, copyFile } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { createConnection } from 'node:net';

const frozen=process.argv[2]==='--frozen';
const config=await loadCutoverConfig();
const dir=frozen?config.frozenBackupDir:config.onlineBackupDir;
const dump=`${dir}/runtime.dump`;
const u=new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('LocalDatabaseOnly');
const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),
  PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGCONNECT_TIMEOUT:'10'};
const bin='D:/Program Files/PostgreSQL/18/bin';
async function run(name,args){
  return await new Promise((resolve,reject)=>{
    const child=spawn(`${bin}/${name}.exe`,args,{env,windowsHide:true,stdio:['ignore','ignore','pipe']});
    let err='';child.stderr.on('data',b=>{err+=b.toString();});
    child.on('error',()=>reject(new Error('BackupToolLaunchFailed')));
    child.on('exit',code=>{if(code===0)resolve();else writeFile(`${dir}/${name}-error.log`,err,{mode:0o600}).then(()=>reject(new Error(`${name}Failed`)));});
  });
}
const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
try{
  if(frozen){const listening=await new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port:3001});s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',e=>{s.destroy();resolve(e.code!=='ECONNREFUSED')});s.setTimeout(1500,()=>{s.destroy();resolve(true)});});if(listening)throw new Error('LocalAppMustBeStopped');}
  try{await stat(dump);throw new Error('ExistingBackupRefused');}catch(e){if(e.code!=='ENOENT')throw e;}
  await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const {rows:[r]}=await c.query('SELECT pg_export_snapshot() AS snapshot, now() AS snapshot_at');
  const {rows:[role]}=await c.query('SELECT rolcreatedb,rolsuper FROM pg_roles WHERE rolname=current_user');
  await run('pg_dump',['--format=custom',`--snapshot=${r.snapshot}`,`--file=${dump}`,'--no-password']);
  await c.query('ROLLBACK');
  await run('pg_restore',['--file=NUL',dump]);
  const hash=createHash('sha256');for await(const chunk of createReadStream(dump))hash.update(chunk);
  await copyFile('.env.local',`${dir}/env.local.backup`,constants.COPYFILE_EXCL);
  if(process.env.FLUXPOST_CONFIG_FILE)await copyFile(process.env.FLUXPOST_CONFIG_FILE,`${dir}/effective-config.backup`,constants.COPYFILE_EXCL);
  const receipt={snapshotAt:r.snapshot_at,finishedAt:new Date().toISOString(),bytes:(await stat(dump)).size,
    sha256:hash.digest('hex'),archiveDecodePassed:true,restoreDrillPerformed:false,
    canCreateDatabase:Boolean(role.rolcreatedb||role.rolsuper),onlineSnapshot:!frozen,cutoverFrozen:frozen};
  await writeFile(`${dir}/receipt.json`,JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify(receipt));
}catch(e){console.error(JSON.stringify({code:e.code||e.message}));process.exitCode=1;}
finally{await c.end();}
