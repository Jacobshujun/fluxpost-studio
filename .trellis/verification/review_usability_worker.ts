import assert from "node:assert/strict";
import { fixturePosts, pureReviewCases, queryReviewCases } from "./review_usability_cases";
import { reorderReviewImages } from "../../src/lib/review-image-order";
async function main() {
  assert.ok(process.env.REVIEW_TEST_ROOT);
  process.chdir(process.env.REVIEW_TEST_ROOT);
  const db = await import("../../src/lib/database");
  const queries = await import("../../src/lib/review-posts");
  const store = await import("../../src/lib/generated-posts");
  const actor = { id: "filter-owner", role: "operator" as const };
  pureReviewCases();
  for (const post of fixturePosts()) await db.saveGeneratedPostToDb(post);
  await queryReviewCases({ list: (params) => queries.listReviewPosts(actor, params), metadata: (params) => queries.getReviewMetadata(actor, params) });
  const post = { ...fixturePosts()[0], imageUrls: ["same", "same", "third"], imagePrompts: ["a", "b", "c"] };
  const moved = reorderReviewImages(post, 0, 2);
  await store.saveGeneratedPost(moved, actor);
  const reloaded = await store.getGeneratedPost(post.id, actor);
  assert.deepEqual(reloaded?.imagePrompts, ["b", "c", "a"]);
  assert.deepEqual(reloaded?.imageUrls, ["same", "third", "same"]);
  assert.equal(reloaded?.createdAt, post.createdAt);
  console.log("Review strict filters, Beijing calendar, SQLite scope/SQL and reorder persistence passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
