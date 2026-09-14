import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import ts from "typescript";

const root=process.cwd();
const require=createRequire(import.meta.url);
const connectionString=process.env.DATABASE_URL;
assert.ok(connectionString,"DATABASE_URL required for isolated local PostgreSQL benchmark");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(new URL(connectionString).hostname),"Local PostgreSQL only");
const schema=`review_bench_${process.pid}_${Date.now()}`;
const admin=new Pool({connectionString,max:1});
const pool=new Pool({connectionString,max:6,options:`-c search_path=${schema}`});
const actor={id:"bench",displayName:"Benchmark",role:"operator"};
const now="2026-09-14T10:00:00.000Z";
const baselineRef=process.env.REVIEW_BASELINE_REF || "c0886bee6f19d02884522009cb4e6e6855fa0298";
assert.match(baselineRef,/^[a-f0-9]{40}$/,"Baseline must be an exact commit");
const source=(file,before=false)=>before?execFileSync("git",["show",`${baselineRef}:${file}`],{encoding:"utf8",maxBuffer:10*1024*1024}):readFileSync(path.join(root,file),"utf8");

function load(file, overrides={}, before=false, tail="") {
  const text=ts.transpileModule(source(file,before)+tail,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:file}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(text,{module:mod,exports:mod.exports,require:(name)=>{
    if(Object.hasOwn(overrides,name))return overrides[name];
    if(name.startsWith("."))return load(path.posix.normalize(path.posix.join(path.posix.dirname(file),name))+".ts");
    return require(name);
  },process,console,Buffer,URL,URLSearchParams,performance,Date,setTimeout,clearTimeout,Request,Response},{filename:file});
  return mod.exports;
}
function database(before) {
  // Only bootstrap is fixture-owned: production queries run unchanged in a disposable schema.
  return load("src/lib/database.ts",{pg:{Pool:class {constructor(){return pool;}}}},before,"\npostgresPool = new Pool(); initializationBackend = 'postgres'; initializationPromise = Promise.resolve();");
}
function domain(before) {
  const db=database(before);
  const generated=load("src/lib/generated-posts.ts",{"./database":db},before);
  const content=load("src/lib/content-pool.ts",{"./database":db,"./source-tagging":{}},before);
  const runtime=load("src/lib/store.ts",{"./database":db},before);
  const reviews=before?undefined:load("src/lib/review-posts.ts",{"./database":db});
  const route=load("src/app/api/review/route.ts",{
    "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    "@/lib/activity-log":{recordExecutionLog:async()=>{},compactError:String},
    "@/lib/content-pool":content,"@/lib/generated-posts":generated,
    "@/lib/openai":{editPostWithPrompt:()=>{throw new Error("Paid calls forbidden");}},
    "@/lib/store":runtime,"@/lib/review-posts":reviews,
    "@/lib/workspace-accounts":{requireWorkspaceAccount:async()=>actor,isWorkspaceSignInError:()=>false},
  },before);
  return {db,generated,content,route,reviews};
}
function p95(values){return +values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1].toFixed(2);}
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(source("db/migrations/001_initial_postgres.sql"));
  const before=domain(true),after=domain(false);
  for(const count of [1000,10000]) {
    await pool.query("TRUNCATE generated_posts,content_projects,runtime_posts");
    await pool.query(`INSERT INTO generated_posts SELECT 'post-'||i,'source-'||i,'xiaohongshu','draft',$2::timestamptz,$2::timestamptz,
      jsonb_build_object('id','post-'||i,'sourceItemId','source-'||i,'ownerUserId','bench','title','Title '||i,'body',repeat('Benchmark body. ',45),'imagePrompt','prompt','imageUrls','[]'::jsonb,'materialPaths','[]'::jsonb,'aiNotes','[]'::jsonb,'platform','xiaohongshu','status','draft','createdAt',$2::text,'updatedAt',$2::text)
      FROM generate_series(0,$1::int-1) i`,[count,now]);
    await pool.query(`INSERT INTO content_projects SELECT 'project-'||i,'query-'||i,'query-'||i,$2::timestamptz,$2::timestamptz,NULL,
      jsonb_build_object('id','project-'||i,'normalizedQuery','query-'||i,'query','query-'||i,'createdAt',$2::text,'updatedAt',$2::text,'items',
        (SELECT jsonb_agg(jsonb_build_object('id','source-'||(i*10+j),'ownerUserId','bench','platform','xiaohongshu','title','Source','contentText','Source text','images','[]'::jsonb,'metrics','{}'::jsonb,'poolStatus','new','usedCount',0,'analysis',jsonb_build_object('hook','fixture'))) FROM generate_series(0,9) j))
      FROM generate_series(0,($1::int/10)-1) i`,[count,now]);
    await pool.query("ANALYZE generated_posts; ANALYZE content_projects");
    for(const [label,service] of [["before",before],["after",after]]) {
      const manual=[],approval=[],stages={read:[],save:[],sync:[]};
      let current=await service.generated.getGeneratedPost("post-0",actor);
      for(let i=0;i<14;i++) {
        const patch={body:`${label} Edit ${i}. ${"Benchmark body. ".repeat(44)}`,status:i%2?"approved":"draft"};
        const start=performance.now();
        const response=await service.route.POST(new Request("http://localhost/api/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(label==="before"?{post:current,manualPatch:patch}:{postId:current.id,manualPatch:patch})}));
        assert.equal(response.status,200);
        current=(await response.json()).post;
        const duration=performance.now()-start;
        if(i>=4) { (i%2?approval:manual).push(duration); for(const match of (response.headers.get("server-timing")||"").matchAll(/(read|save|sync);dur=([\d.]+)/g)) stages[match[1]].push(Number(match[2])); }
      }
      const full=await service.generated.listGeneratedPosts(actor);
      const list=service.reviews?await service.reviews.listReviewPosts(actor,new URLSearchParams()):{posts:full};
      console.log(JSON.stringify({backend:"postgres",label,count,manualP95Ms:p95(manual),approvalWithEditP95Ms:p95(approval),responseBytes:Buffer.byteLength(JSON.stringify(list)),stageP95Ms:Object.fromEntries(Object.entries(stages).filter(([,v])=>v.length).map(([k,v])=>[k,p95(v)]))}));
      if(label==="after") { assert.ok(p95(manual)<=500); assert.ok(p95(approval)<=500); }
    }
    const first=await after.reviews.listReviewPosts(actor,new URLSearchParams());
    const second=await after.reviews.listReviewPosts(actor,new URLSearchParams({cursor:first.nextCursor}));
    assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,100);
    assert.equal((await after.reviews.getReviewMetadata(actor,new URLSearchParams())).summary.total,count);
    assert.equal((await after.reviews.listReviewPosts({...actor,id:"other"},new URLSearchParams())).posts.length,0);
    const current=await after.generated.getGeneratedPost("post-0",actor);
    await Promise.all(Array.from({length:12},(_,i)=>after.content.markSourceRewritten(`source-${i%2}`,{...current,status:"published"},actor)));
    const row=(await pool.query("SELECT data_json FROM content_projects WHERE id='project-0'")).rows[0].data_json;
    assert.equal(row.items[0].poolStatus,"published");assert.equal(row.items[1].poolStatus,"published");
    assert.equal(row.items[0].usedCount,1);assert.equal(row.items[1].usedCount,1);
  }
  console.log("Isolated PostgreSQL pagination, metadata, ownership and concurrent source sync passed.");
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
