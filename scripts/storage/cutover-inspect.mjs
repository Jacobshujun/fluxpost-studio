process.on("SIGINT", () => {});
import { loadCutoverConfig } from "./cutover-config.mjs";
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import OSS from 'ali-oss';

const dir = (await loadCutoverConfig()).evidenceDir;
const prefix = 'fluxpost/flux-lightmoment/';
const targetHost = 'xpai-imc.oss-cn-guangzhou.aliyuncs.com';
const cap = 32 * 1024 * 1024;
let consumed = 0;
const safeError = e => ({ code: String(e.code || e.name || 'Error'), status: e.statusCode || e.status || null });
function scoped(key) {
  if (!key.startsWith(prefix) || key.split('/').some(p => p === '..' || p === '.')) throw new Error('ScopeRejected');
  return key;
}
function budget(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || consumed + bytes > cap) throw new Error('BudgetExceeded');
  consumed += bytes;
}
function urlFor(base, key) {
  const u = new URL(base);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('OriginRejected');
  return `${u.origin}/${scoped(key).split('/').map(encodeURIComponent).join('/')}`;
}
async function boundedGet(url, limit, range) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'error', signal: controller.signal,
      headers: range ? { Range: range, 'Accept-Encoding': 'identity' } : { 'Accept-Encoding': 'identity' } });
    if (r.status !== (range ? 206 : 200)) { controller.abort(); throw Object.assign(new Error('UnexpectedHttpStatus'), { status: r.status }); }
    const length = Number(r.headers.get('content-length'));
    if (!r.headers.has('content-length') || !Number.isSafeInteger(length) || length > limit || length < 0) { controller.abort(); throw new Error('LengthRejected'); }
    budget(length);
    const chunks = []; let read = 0;
    for await (const chunk of r.body) {
      read += chunk.length;
      if (read > length || read > limit) { controller.abort(); throw new Error('BodyLimitExceeded'); }
      chunks.push(Buffer.from(chunk));
    }
    if (read !== length) throw new Error('TruncatedBody');
    return { bytes: Buffer.concat(chunks), status: r.status, type: r.headers.get('content-type'),
      disposition: r.headers.get('content-disposition'), range: r.headers.get('content-range') };
  } finally { clearTimeout(timer); }
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--self-test') {
    assert.throws(() => scoped('elsewhere/a.jpg'));
    assert.throws(() => scoped(prefix + '../a.jpg'));
    assert.throws(() => urlFor('http://example.com', prefix + 'a.jpg'));
    assert.throws(() => urlFor('https://user:secret@example.com', prefix + 'a.jpg'));
    assert.throws(() => budget(cap + 1));
    assert.throws(() => budget(-1));
    assert.equal(JSON.stringify(safeError({ message: 'secret', code: 'Denied' })), '{"code":"Denied","status":null}');
    const text = await readFile(import.meta.filename, 'utf8');
    assert.ok(!/\.(put|delete|copy|uploadPart|completeMultipartUpload|initMultipartUpload)\s*\(/.test(text));
    console.log('Offline scope, budget, origin, redaction and no-write call checks passed.');
    return;
  }
  if (!['--samples', '--inventory'].includes(mode)) throw new Error('ExplicitReadModeRequired');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLSRequired');
  const env = { ...process.env };
  if (env.FLUXPOST_CONFIG_FILE) Object.assign(env, parseEnv(await readFile(env.FLUXPOST_CONFIG_FILE, 'utf8')));
  if (env.TOS_BUCKET !== 'seedance-gz-xpeng22365' || (env.TOS_OBJECT_PREFIX || prefix.slice(0,-1)).replace(/\/$/,'') !== prefix.slice(0,-1)) throw new Error('SourceMismatch');
  if (mode === '--samples') {
    const samples = JSON.parse(await readFile(`${dir}/samples.json`, 'utf8'));
    if (samples.length > 8 || samples.some(s => s.size > 1024*1024 || s.size <= 0)) throw new Error('SamplesRejected');
    const sharp = (await import('sharp')).default;
    const results = [];
    for (const [i,s] of samples.entries()) {
      const result = { index:i, key:s.key, group:s.status, expectedSize:s.size };
      try {
        const targetUrl = urlFor(`https://${targetHost}`, s.key);
        const sourceBase = env.TOS_PUBLIC_BASE_URL;
        const sourceUrl = urlFor(sourceBase.includes('://') ? sourceBase : `https://${sourceBase}`, s.key);
        const a = await boundedGet(sourceUrl, s.size);
        const b = await boundedGet(targetUrl, s.size);
        result.sourceStatus=a.status; result.targetStatus=b.status;
        result.sizeMatch=a.bytes.length === s.size && b.bytes.length === s.size;
        result.sha256Match=createHash('sha256').update(a.bytes).digest('hex') === createHash('sha256').update(b.bytes).digest('hex');
        if (!result.sizeMatch || !result.sha256Match) throw new Error('ContentMismatch');
        result.type=b.type; result.disposition=b.disposition;
        const ext=s.key.split('.').pop().toLowerCase();
        if (['jpg','png','webp','gif'].includes(ext)) {
          const image = await sharp(b.bytes).raw().toBuffer({ resolveWithObject: true });
          result.decoded={ width:image.info.width,height:image.info.height };
        } else {
          const range=await boundedGet(targetUrl,32,'bytes=0-31');
          result.rangeMatch=range.range === `bytes 0-31/${s.size}` && range.bytes.equals(b.bytes.subarray(0,32));
          if (!result.rangeMatch) throw new Error('RangeMismatch');
        }
        await writeFile(`${dir}/sample-${i}.${ext}`, b.bytes);
        result.saved=`sample-${i}.${ext}`;
      } catch(e) { result.error=safeError(e); }
      results.push(result);
    }
    await writeFile(`${dir}/sample-results.json`,JSON.stringify({at:new Date().toISOString(),consumed,results},null,2));
    console.log(JSON.stringify({consumed,results:results.map(result=>{const safe={...result};delete safe.key;return safe;})},null,2));
    if(results.some(r=>r.error))process.exitCode=1;
    return;
  }
  const require = createRequire(import.meta.url);
  const TosClient = require('@volcengine/tos-sdk').default;
  const source = new TosClient({ accessKeyId:env.TOS_ACCESS_KEY_ID, accessKeySecret:env.TOS_ACCESS_KEY_SECRET,
    endpoint:new URL(/^https:\/\//.test(env.TOS_ENDPOINT)?env.TOS_ENDPOINT:`https://${env.TOS_ENDPOINT}`).host,
    region:env.TOS_REGION||'cn-guangzhou', bucket:env.TOS_BUCKET, secure:true, enableVerifySSL:true, maxRetryCount:0 });
  const keyText=await readFile(env.FLUXPOST_OSS_KEY_FILE||'aliyun_oss_key.txt','utf8');
  function credential(label) {
    const m=keyText.match(new RegExp(`^\\s*${label}\\s*[:=：]\\s*(\\S+)\\s*$`,'im'));
    if(!m)throw new Error('CredentialFormatUnsupported');
    return m[1];
  }
  const target=new OSS({accessKeyId:credential('AccessKey\\s*Id'),accessKeySecret:credential('AccessKey\\s*Secret'),
    bucket:'xpai-imc',endpoint:'https://oss-cn-guangzhou.aliyuncs.com',region:'oss-cn-guangzhou',
    secure:true,authorizationV4:true,timeout:30000,retryMax:0});
  const report={start:new Date().toISOString(),readOnly:true,source:[],target:[]};
  let token; const sourceTokens=new Set();
  do {
    const {data}=await source.listObjectsType2({bucket:env.TOS_BUCKET,prefix,maxKeys:1000,...(token?{continuationToken:token}:{}),listOnlyOnce:true});
    report.source.push(...data.Contents.map(o=>({key:scoped(o.Key),size:o.Size,modified:o.LastModified,etag:o.ETag})));
    token=data.IsTruncated?data.NextContinuationToken:undefined;
    if(data.IsTruncated&&(!token||sourceTokens.has(token)))throw new Error('SourcePaginationInvalid');
    sourceTokens.add(token);
    if(sourceTokens.size>300)throw new Error('PageLimit');
  }while(token);
  let marker;const targetTokens=new Set();
  do {
    const r=await target.list({prefix,'max-keys':1000,...(marker?{marker}:{})},{});
    report.target.push(...(r.objects||[]).map(o=>({key:scoped(o.name),size:Number(o.size),modified:o.lastModified,etag:o.etag})));
    marker=r.isTruncated?r.nextMarker:undefined;
    if(r.isTruncated&&(!marker||targetTokens.has(marker)))throw new Error('TargetPaginationInvalid');
    targetTokens.add(marker);
    if(targetTokens.size>300)throw new Error('PageLimit');
  }while(marker);
  report.end=new Date().toISOString();
  await writeFile(`${dir}/inventory.json`,JSON.stringify(report));
  console.log(JSON.stringify({start:report.start,end:report.end,sourceCount:report.source.length,targetCount:report.target.length}));
}
main().catch(e=>{console.error(JSON.stringify(safeError(e)));process.exitCode=1;});
