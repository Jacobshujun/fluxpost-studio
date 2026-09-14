import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import type { GeneratedPost } from "../../src/lib/types";

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), "fluxpost-review-bench-"));
  process.chdir(root);
  delete process.env.DATABASE_URL;
  process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS = "1";
  const db = await import("../../src/lib/database");
  const posts = await import("../../src/lib/generated-posts");
  const { markSourceRewritten } = await import("../../src/lib/content-pool");
  const { savePost } = await import("../../src/lib/store");
  const { listReviewPosts } = await import("../../src/lib/review-posts");
  await db.readGeneratedPostsFromDb();
  const seed = new DatabaseSync(db.sqliteStorePath);
  const account = { id: "bench", displayName: "Benchmark", role: "operator" as const };
  const now = new Date().toISOString();
  const makePost = (i: number): GeneratedPost => ({ id: `post-${i}`, sourceItemId: `source-${i}`, ownerUserId: account.id, title: `Title ${i}`, body: "Benchmark body. ".repeat(45), imagePrompt: "Image prompt", imageUrls: [], materialPaths: [], aiNotes: [], platform: "xiaohongshu", status: "draft", createdAt: now, updatedAt: now });
  for (const count of [1000, 10000]) {
    seed.exec("DELETE FROM generated_posts; DELETE FROM content_projects; BEGIN");
    const insertPost = seed.prepare("INSERT INTO generated_posts VALUES (?,?,?,?,?,?,?)");
    const insertProject = seed.prepare("INSERT INTO content_projects VALUES (?,?,?,?,?,?,?)");
    for (let i = 0; i < count; i++) {
      const post = makePost(i);
      insertPost.run(post.id, post.sourceItemId, post.platform, post.status, now, now, JSON.stringify(post));
      if (i % 10 === 0) {
        const project = { id: `project-${i}`, normalizedQuery: `query-${i}`, query: `query-${i}`, createdAt: now, updatedAt: now, items: Array.from({ length: 10 }, (_, j) => ({ id: `source-${i+j}`, ownerUserId: account.id, platform: "xiaohongshu", title: "Source", contentText: "Source text", images: [], metrics: {}, poolStatus: "new", usedCount: 0, analysis: { hook: "fixture" } })) };
        insertProject.run(project.id, project.normalizedQuery, project.query, now, now, null, JSON.stringify(project));
      }
    }
    seed.exec("COMMIT");
    const timings: Record<string, number[]> = { read: [], save: [], sync: [], total: [] };
    for (let i = 0; i < 24; i++) {
      const start = performance.now();
      const current = await posts.getGeneratedPost("post-0", account);
      const read = performance.now();
      const saved = await posts.saveGeneratedPost({ ...current!, body: `Edit ${i}. ` + makePost(0).body, updatedAt: new Date().toISOString() }, account);
      const save = performance.now();
      await savePost(saved, account, saved);
      await markSourceRewritten(saved.sourceItemId, saved, account);
      const end = performance.now();
      if (i >= 4) { timings.read.push(read-start); timings.save.push(save-read); timings.sync.push(end-save); timings.total.push(end-start); }
    }
    const all = await posts.listGeneratedPosts(account);
    const page = await listReviewPosts(account, new URLSearchParams());
    console.log(JSON.stringify({ count, fullListBytes: Buffer.byteLength(JSON.stringify({ posts: all })), pageBytes: Buffer.byteLength(JSON.stringify(page)), p95Ms: Object.fromEntries(Object.entries(timings).map(([key, values]) => [key, +values.sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1].toFixed(2)])) }));
  }
  seed.close();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
