process.on("SIGINT", () => {});
import { loadCutoverConfig } from "./cutover-config.mjs";
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
const evidence=(await loadCutoverConfig()).evidenceDir;
const c=new pg.Client({connectionString:process.env.FLUXPOST_DIAG_DATABASE_URL,statement_timeout:15000});
try{
 await c.connect();await c.query('BEGIN READ ONLY');
 const queues={};
 for(const table of ['canvas_run_queue','simple_run_queue','feishu_publish_queue','original_batch_queue','library_tagging_jobs']){
  queues[table]=(await c.query(`SELECT count(*) FILTER(WHERE status='running' AND locked_until>now())::int AS live, count(*) FILTER(WHERE status='queued' AND run_after<=now() AND attempts<max_attempts)::int AS runnable FROM public."${table}"`)).rows[0];
 }
 const provider=(await c.query("SELECT count(*)::int n FROM canvas_run_queue q WHERE q.status='running' AND q.locked_until<=now() AND EXISTS(SELECT 1 FROM canvas_node_runs n WHERE n.run_id=q.run_id AND n.status='running' AND COALESCE(n.data_json->>'providerTaskId','')<>'')")).rows[0].n;
 const iteration=(await c.query(`SELECT count(*)::int n FROM canvas_run_queue q JOIN canvas_runs r ON r.id=q.run_id
 WHERE r.status IN ('queued','running') AND COALESCE(r.data_json->>'iterationAdmissionPending','false')<>'true'
 AND ((q.status='waiting' AND r.data_json->>'iterationContext' IS NULL AND r.data_json->'graphSnapshot'->'nodes' @> '[{"type":"utility.image-iterate"}]'::jsonb)
 OR (q.status='running' AND (q.locked_until IS NULL OR q.locked_until<=now()) AND (r.data_json->>'iterationContext' IS NOT NULL OR r.data_json->'graphSnapshot'->'nodes' @> '[{"type":"utility.image-iterate"}]'::jsonb)))`)).rows[0].n;
 const runs=new Set((await c.query('SELECT id FROM canvas_runs')).rows.map(r=>r.id));
 const schedules=(await c.query("SELECT data_json FROM canvas_schedules WHERE status IN ('running','queued','paused')")).rows;
 let admission=0,retries=0,missingAggregate=0;
 for(const {data_json:s}of schedules){
  if(s.status==='paused')continue;
  if(s.schemaVersion===2){for(const main of s.mainTasks||[]){
    const sharedReady=!(s.definition?.sharedOutputs?.length)||main.sharedStatus==='completed';
    if(!sharedReady)continue;
    for(const child of main.childTasks||[]){if(!child.runId&&child.status==='pending')admission++;if(child.retryPending&&child.runId)retries++;}
    const children=main.childTasks||[];
    if(s.definition?.mainTargetNodeId&&children.length&&children.every(x=>['completed','partial','failed','cancelled'].includes(x.status))&&children.some(x=>x.status==='completed'||x.status==='partial')&&(!main.mainRunId||!runs.has(main.mainRunId)))missingAggregate++;
  }}else{for(const batch of s.batches||[])for(const content of batch.contentTasks||[]){const images=content.imageTasks||[];
    if(images.length&&images.every(x=>['completed','partial','failed','cancelled'].includes(x.status))&&images.some(x=>x.imageUrls?.length)&&(!content.finalRunId||!runs.has(content.finalRunId)))missingAggregate++;
  }}
 }
 await c.query('ROLLBACK');
 const summary={at:new Date().toISOString(),queues,providerRecovery:provider,iterationRecovery:iteration,scheduleAdmission:admission,scheduleRetries:retries,missingAggregate};
 const safe=Object.values(queues).every(q=>q.live===0&&q.runnable===0)&&!provider&&!iteration&&!admission&&!retries&&!missingAggregate;
 await writeFile(`${evidence}/cutover-preflight.json`,JSON.stringify({...summary,safe},null,2));
 console.log(JSON.stringify({...summary,safe}));if(!safe)process.exitCode=1;
}catch(e){console.error(JSON.stringify({code:e.code||e.name}));process.exitCode=1;}
finally{await c.end();}
