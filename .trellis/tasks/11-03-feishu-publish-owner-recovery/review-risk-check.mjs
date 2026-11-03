// Audit probes: reproduce current defects without real files, DB, CLI or network.
// These assertions document defects; they are not acceptance tests for a fix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const results = [];
const copy = value => structuredClone(value);

function load(relative, stubs = {}, privateExports = [], globals = {}) {
  const source = readFileSync(path.join(root, relative), 'utf8');
  const output = ts.transpileModule(source + (privateExports.length ? `\nexport { ${privateExports.join(',')} };` : ''), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: relative,
  }).outputText;
  const mod = { exports: {} };
  const sandbox = {
    console, Buffer, URL, structuredClone,
    process: { cwd: () => root, env: { FLUXPOST_DISABLE_BACKGROUND_WORKERS: '1' }, platform: 'win32', execPath: 'node', pid: 1 },
    setTimeout: () => { throw new Error('Unexpected timer in offline audit'); },
    ...globals,
  };
  const safeRequire = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (['node:path', 'node:crypto', 'node:os', 'node:util'].includes(name)) return require(name);
    throw new Error(`Unmocked import blocked: ${relative}: ${name}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, sandbox, { filename: relative })(safeRequire, mod, mod.exports);
  return mod.exports;
}

const mode = load('src/lib/feishu-publish-mode.ts');
const batching = load('src/lib/feishu-publish-batching.ts');
const verification = load('src/lib/feishu-record-verification.ts');
const ownership = load('src/lib/workspace-ownership.ts');
const bodyPolicy = load('src/lib/finished-body-policy.ts');
const titleGuard = load('src/lib/title-guard.ts');
const fixture = patch => ({
  id: 'audit-post', ownerUserId: 'audit-owner', ownerDisplayName: 'Audit',
  sourceItemId: 'audit-source', title: 'Originaltitle', body: 'Original body',
  status: 'approved', platform: 'xiaohongshu', imageUrls: ['/generated/new.png'],
  updatedAt: '2026-11-03T00:00:00Z', ...patch,
});

function makeCli({ exists = () => true, materialize, remote } = {}) {
  const writes = new Map();
  const calls = [];
  const exec = () => { throw new Error('Real CLI execution blocked'); };
  exec[promisify.custom] = async (_file, args) => {
    calls.push([...args]);
    return remote ? remote(args, writes) : { stdout: '{}', stderr: '' };
  };
  const cli = load('src/lib/feishu-cli.ts', {
    'node:child_process': { execFile: exec },
    'node:fs': { existsSync: exists },
    'node:fs/promises': { mkdir: async () => {}, writeFile: async (file, value) => { writes.set(file, value); } },
    './activity-log': { recordExecutionLog: async () => {} },
    './config': { appConfig: {
      feishuCliBin: 'audit-cli', feishuCliArgs: '', feishuAppId: 'audit-app', feishuAppSecret: 'dummy-secret',
      feishuBitableAppToken: 'dummy-base', feishuBitableTableId: 'dummy-table', feishuBitableFieldMap: '',
      feishuNotifyChatId: '', feishuNotifyUserId: '',
    } },
    './concurrency': {
      concurrencyConfig: { feishuAttachment: 3, media: 3 },
      mapWithConcurrency: (items, _limit, fn) => Promise.all(items.map(fn)),
      runWithConcurrencyPool: (_name, fn) => fn(),
    },
    './feishu-publish-batching': batching,
    './feishu-cli-identity': { ensureFeishuCliIdentity: async () => {} },
    './feishu-publish-mode': mode,
    './feishu-record-verification': verification,
    './runtime-media-materializer': { materializeRuntimeMedia: materialize || (async () => { throw new Error('Mock unavailable media'); }) },
  }, ['uploadGeneratedMediaToFeishu', 'resolvePostAttachmentFiles', 'buildFeishuPostStateUpdates', 'resolveLocalMediaFile']);
  return { cli, calls, writes };
}

function makeGenerated(initial) {
  let current = copy(initial);
  const generatedModule = load('src/lib/generated-posts.ts', {
    './database': {
      getGeneratedPostFromDb: async () => copy(current),
      getGeneratedPostsByIdsFromDb: async () => current ? [copy(current)] : [],
      saveGeneratedPostToDb: async post => { current = copy(post); },
    },
    './workspace-ownership': ownership, './finished-body-policy': bodyPolicy, './title-guard': titleGuard,
  });
  return { module: generatedModule, get: () => copy(current), set: value => { current = copy(value); } };
}

function makeQueue(generated, extraDb = {}) {
  const db = { saveFeishuPublishJobToDb: async job => job, ...extraDb };
  return load('src/lib/feishu-publish-queue.ts', {
    './activity-log': { compactError: error => error.message, recordExecutionLog: async () => {} },
    './content-pool': { markSourceRewritten: async () => {} }, './database': db,
    './feishu-cli': {}, './feishu-publish-mode': mode, './finished-body-policy': bodyPolicy,
    './feishu-field-options': {}, './feishu-publish-batching': batching,
    './generated-posts': generated.module, './runtime-media-materializer': {},
    './store': { savePost: async post => post }, './workspace-ownership': ownership,
  }, ['persistOnePost', 'loadLatestPostsForJob', 'buildJobResult']);
}

// R1: same attachment count is treated as identical media, including reordered media.
{
  const { cli, calls } = makeCli();
  const post = fixture({ feishu: { recordId: 'rec_old', attachmentStatus: 'uploaded', attachmentFileCount: 1 } });
  const result = await cli.uploadGeneratedMediaToFeishu([post], [{ postId: post.id, recordId: 'rec_old', created: false }], 'Media',
    new Map([[post.id, { files: ['./public/generated/new.png'], cleanup: async () => {} }]]));
  assert.equal(result.uploads[0].status, 'skipped');
  assert.equal(calls.length, 0);
  const published = await cli.publishPostsToFeishu([post], { publishMode: 'media' });
  assert.equal(published.status, 'published');
  assert.equal(calls.length, 0);
  results.push('R1 CONFIRMED: replacing media without changing count skips the CLI upload.');
}

// R2: one successful video suppresses failures for all other videos.
{
  const good = path.join(root, 'public', 'media', 'good.mp4');
  const { cli } = makeCli({ exists: file => file === good });
  const result = await cli.resolvePostAttachmentFiles(fixture({ imageUrls: [], videoUrls: ['/media/good.mp4', '/media/missing.mp4'] }));
  assert.equal(result.files.length, 1);
  assert.equal(result.failures.length, 0);
  const full = makeCli({ exists: file => file === good, remote: async args => ({
    stdout: args[1] === '+record-batch-create' ? JSON.stringify({ record_id_list: ['rec_partial_video'] }) : '{}', stderr: '',
  }) });
  const published = await full.cli.publishPostsToFeishu([
    fixture({ imageUrls: [], videoUrls: ['/media/good.mp4', '/media/missing.mp4'] }),
  ], { publishMode: 'media' });
  assert.equal(published.status, 'published');
  assert.equal(published.postStates[0].feishu.attachmentFileCount, 1);
  results.push('R2 CONFIRMED: two requested videos, one unavailable, produces one file and zero failures.');
}

// R3: publication persistence writes an old whole-post snapshot over a newer edit.
{
  const original = fixture();
  const generated = makeGenerated(original);
  const queue = makeQueue(generated);
  await generated.module.saveGeneratedPost({ ...original, title: 'Neweditedtitle', body: 'New edit while publishing' });
  await queue.persistOnePost({ ...original, status: 'published', feishu: { recordId: 'rec_old', recordStatus: 'verified' } });
  assert.equal(generated.get().title, original.title);
  assert.equal(generated.get().body, original.body);
  results.push('R3 CONFIRMED: saving publish progress restores the old title/body over a newer edit.');
}

// R4: local path acceptance does not enforce public/media or public/generated containment.
{
  const outside = path.join(root, 'audit-private', 'extensionless-fixture');
  const { cli, calls } = makeCli({ exists: file => file === outside });
  const result = await cli.resolvePostAttachmentFiles(fixture({ imageUrls: ['/../audit-private/extensionless-fixture'] }));
  assert.equal(result.files.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.files[0], './audit-private/extensionless-fixture');
  await cli.uploadGeneratedMediaToFeishu([fixture({ imageUrls: ['/../audit-private/extensionless-fixture'] })],
    [{ postId: 'audit-post', recordId: 'rec_fixture', created: false }], 'Media',
    new Map([['audit-post', result]]));
  const upload = calls.find(args => args.includes('+record-upload-attachment'));
  assert.equal(upload[upload.indexOf('--file') + 1], './audit-private/extensionless-fixture');
  results.push('R4 CONFIRMED: a traversal path outside public is accepted as a publishable local attachment (synthetic file only).');
}

// R5: text-only replacement inherits attachment success from the deleted record.
{
  const { cli, calls } = makeCli();
  const post = fixture({ feishu: { recordId: 'rec_deleted', attachmentStatus: 'uploaded', attachmentFileCount: 1 } });
  const [state] = cli.buildFeishuPostStateUpdates([post], [{ postId: post.id, recordId: 'rec_new', created: true }], [], [], [], 'mock-payload', 'text');
  assert.equal(state.feishu.recordId, 'rec_new');
  assert.equal(state.feishu.attachmentStatus, 'uploaded');
  const result = await cli.uploadGeneratedMediaToFeishu([{ ...post, feishu: state.feishu }],
    [{ postId: post.id, recordId: 'rec_new', created: false }], 'Media',
    new Map([[post.id, { files: ['./public/generated/new.png'], cleanup: async () => {} }]]));
  assert.equal(result.uploads[0].status, 'skipped');
  assert.equal(calls.length, 0);
  results.push('R5 CONFIRMED: a new text-only replacement inherits uploaded state and later skips missing media.');
}

// R6: a deleted post is resurrected from a queued snapshot and can be published.
{
  const generated = makeGenerated(undefined);
  const queue = makeQueue(generated);
  const post = fixture();
  const [latest] = await queue.loadLatestPostsForJob({ posts: [post], postIds: [post.id] });
  await queue.persistOnePost(latest);
  assert.equal(generated.get().id, post.id);
  results.push('R6 CONFIRMED: deleting a queued post does not cancel publishing; its snapshot recreates the local post.');
}

// R7: create IDs are not checkpointed until attachment processing settles.
{
  let created = 0;
  let checkpoints = 0;
  let releaseUpload;
  let reachedUpload;
  const uploading = new Promise(resolve => { reachedUpload = resolve; });
  const waitUpload = new Promise(resolve => { releaseUpload = resolve; });
  const remoteFields = new Map();
  const { cli } = makeCli({ remote: async (args, writes) => {
    const command = args[1];
    if (command === '+record-batch-create') {
      created += 1;
      return { stdout: JSON.stringify({ record_id_list: [`rec_created_${created}`] }), stderr: '' };
    }
    if (command === '+record-upsert') {
      const id = args[args.indexOf('--record-id') + 1];
      const input = args[args.indexOf('--json') + 1].slice(1);
      remoteFields.set(id, JSON.parse(writes.get(input) ?? writes.get(path.resolve(root, input))));
      return { stdout: '{}', stderr: '' };
    }
    if (command === '+record-get') {
      const id = args[args.indexOf('--record-id') + 1];
      const fields = remoteFields.get(id);
      return { stdout: JSON.stringify({ fields: Object.keys(fields), record_id_list: [id], data: [Object.values(fields)] }), stderr: '' };
    }
    if (command === '+record-upload-attachment') {
      reachedUpload();
      await waitUpload;
      return { stdout: '{}', stderr: '' };
    }
    throw new Error(`Unexpected mock command ${command}`);
  } });
  const publishing = cli.publishPostsToFeishu([fixture()], { onChunkComplete: async () => { checkpoints += 1; } });
  await uploading;
  assert.equal(created, 1);
  assert.equal(checkpoints, 0);
  releaseUpload();
  const result = await publishing;
  assert.equal(result.status, 'published');
  assert.equal(checkpoints, 1);
  results.push('R7 CONFIRMED: a remote record exists while upload is pending, but its ID has not reached the persistence callback.');
}

// R8: progress upsert resets a renewed worker lease to the old expiry.
{
  const source = readFileSync(path.join(root, 'src/lib/database.ts'), 'utf8');
  const ast = ts.createSourceFile('database.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['saveFeishuPublishJobToDb', 'heartbeatFeishuPublishQueueItem'];
  const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
  let lease;
  const pool = { query: async (sql, values) => {
    if (sql.includes('INSERT INTO feishu_publish_queue')) lease = values[10];
    else if (sql.includes('UPDATE feishu_publish_queue')) lease = values[0];
    else throw new Error('Unexpected SQL');
  } };
  const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(`(function(exports){${output}\n})`, {
    ensureDatabaseReady: async () => {}, getDatabaseBackend: () => 'postgres', getPostgresPool: () => pool,
    toJson: JSON.stringify,
  })(mod.exports);
  const job = { id: 'audit-job', ownerUserId: 'audit-owner', lockedBy: 'worker', lockedUntil: '2000-01-01T00:10:00.000Z' };
  await mod.exports.saveFeishuPublishJobToDb(job);
  await mod.exports.heartbeatFeishuPublishQueueItem(job.id, 'worker');
  assert.notEqual(lease, job.lockedUntil);
  await mod.exports.saveFeishuPublishJobToDb(job);
  assert.equal(lease, job.lockedUntil);
  results.push('R8 CONFIRMED: a progress save overwrites the heartbeat-renewed lease with its stale snapshot expiry (mock SQL sink).');
}

console.log(results.join('\n'));
console.log(`Reproduced ${results.length} current risk scenarios offline; no application code changed.`);
