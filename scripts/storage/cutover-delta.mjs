process.on("SIGINT", () => {});
import { loadCutoverConfig } from "./cutover-config.mjs";
import { readFile, writeFile, open, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import OSS from 'ali-oss';
import { copyOne, PREFIX, SOURCE_BUCKET, TARGET_BUCKET } from './bulk-core.mjs';

async function main(){
  if(process.argv[2]!=='--apply-delta')throw new Error('ExplicitDeltaApprovalRequired');
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='1')throw new Error('StrictTlsRequired');
  const config=await loadCutoverConfig();
  const root=config.evidenceDir;
  const inv=JSON.parse(await readFile(`${root}/inventory.json`,'utf8'));
  if(Date.now()-Date.parse(inv.end)>30*60*1000)throw new Error('FreshInventoryRequired');
  const dst=new Map(inv.target.map(x=>[x.key,x]));
  const items=inv.source.filter(x=>!dst.has(x.key));
  const bytes=items.reduce((s,x)=>s+x.size,0);
  if(items.length>500||bytes>512*1024*1024)throw new Error('DeltaScopeLimit');
  if(items.some(x=>!x.key.startsWith(PREFIX)||x.key.startsWith(`${PREFIX}aliyun_import_report/`)||x.key.includes('\\')||x.key.split('/').some(s=>s==='..'||s==='.')||!x.etag||!Number.isSafeInteger(x.size)||x.size<=0||x.size>64*1024*1024))throw new Error('DeltaItemInvalid');
  if(inv.source.some(x=>dst.has(x.key)&&dst.get(x.key).size!==x.size))throw new Error('ExistingSizeCollision');
  const backup=JSON.parse(await readFile(`${config.frozenBackupDir}/receipt.json`,'utf8'));
  if(!backup.archiveDecodePassed || !backup.cutoverFrozen || !(await stat(`${config.frozenBackupDir}/runtime.dump`)).size)throw new Error('BackupRequired');
  const env=process.env;
  if(env.TOS_BUCKET!==SOURCE_BUCKET || !['tos-cn-guangzhou.volces.com','https://tos-cn-guangzhou.volces.com'].includes(env.TOS_ENDPOINT))throw new Error('SourceConfigMismatch');
  const keyText=await readFile(env.FLUXPOST_OSS_KEY_FILE||'aliyun_oss_key.txt','utf8');
  const credential=label=>{const m=keyText.match(new RegExp(`^\\s*${label}\\s*[:=：]\\s*(\\S+)\\s*$`,'im'));if(!m)throw new Error('CredentialFormatUnsupported');return m[1];};
  const TosClient=createRequire(import.meta.url)('@volcengine/tos-sdk').default;
  const source=new TosClient({accessKeyId:env.TOS_ACCESS_KEY_ID,accessKeySecret:env.TOS_ACCESS_KEY_SECRET,endpoint:'tos-cn-guangzhou.volces.com',region:'cn-guangzhou',bucket:SOURCE_BUCKET,secure:true,enableVerifySSL:true,maxRetryCount:0,requestTimeout:60000});
  const target=new OSS({accessKeyId:credential('AccessKey\\s*Id'),accessKeySecret:credential('AccessKey\\s*Secret'),endpoint:'https://oss-cn-guangzhou.aliyuncs.com',region:'oss-cn-guangzhou',bucket:TARGET_BUCKET,secure:true,authorizationV4:true,timeout:60000,retryMax:0});
  const info=(await target.getBucketInfo(TARGET_BUCKET)).bucket;
  if(info?.Name!==TARGET_BUCKET||info.Location!=='oss-cn-guangzhou'||info.StorageClass!=='Standard'||info.AccessControlList?.Grant!=='public-read'||info.ServerSideEncryptionRule?.SSEAlgorithm!=='None')throw new Error('TargetDefaultsChanged');
  const job=`${root}/delta-${randomUUID()}`;await mkdir(job);
  await writeFile(`${job}/manifest.json`,JSON.stringify({createdAt:new Date().toISOString(),sourceInventoryAt:inv.end,bytes,items},null,2),{mode:0o600});
  const journal=await open(`${job}/journal.ndjson`,'ax',0o600);
  const summary={startedAt:new Date().toISOString(),total:items.length,bytes,verified:0,uploaded:0,failed:0,status:'running'};
  const record=async event=>{await journal.writeFile(JSON.stringify({at:new Date().toISOString(),...event})+'\n');await journal.sync();if(event.state==='uploaded')summary.uploaded++;if(event.state==='verified')summary.verified++;};
  try{
    console.log(JSON.stringify({deltaObjects:items.length,deltaBytes:bytes,mode:'create-only-single-worker'}));
    for(const item of items){
      await copyOne({source,target,item,record});
      if(summary.verified%25===0)console.log(JSON.stringify({verified:summary.verified,total:summary.total}));
    }
    summary.status='verified';
  }catch(e){summary.failed=1;summary.status='failed';summary.error=e.code||e.name;process.exitCode=1;}
  finally{summary.finishedAt=new Date().toISOString();await journal.close();await writeFile(`${job}/summary.json`,JSON.stringify(summary,null,2));await writeFile(`${root}/delta-latest.json`,JSON.stringify({job,summary},null,2));}
  console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error(JSON.stringify({code:e.code||e.name,message:['DeltaScopeLimit','FreshInventoryRequired','TargetDefaultsChanged'].includes(e.message)?e.message:undefined}));process.exitCode=1;});
