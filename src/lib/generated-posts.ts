import {
  deleteGeneratedPostFromDb,
  deleteGeneratedPostsFromDb,
  readGeneratedPostsFromDb,
  saveGeneratedPostToDb,
} from "./database";
import type { GeneratedPost } from "./types";

type StoredGeneratedPosts = {
  posts: GeneratedPost[];
};

export async function listGeneratedPosts() {
  const store = await readGeneratedPosts();
  return store.posts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGeneratedPost(postId: string) {
  const store = await readGeneratedPosts();
  return store.posts.find((post) => post.id === postId);
}

export async function saveGeneratedPost(post: GeneratedPost) {
  const store = await readGeneratedPosts();
  const previous = store.posts.find((item) => item.id === post.id);
  const nextPost: GeneratedPost = {
    ...post,
    createdAt: post.createdAt || previous?.createdAt || new Date().toISOString(),
    version: post.version || previous?.version || 1,
    updatedAt: post.updatedAt || new Date().toISOString(),
  };
  await saveGeneratedPostToDb(nextPost);
  return nextPost;
}

export async function updateGeneratedPost(postId: string, patch: Partial<GeneratedPost>) {
  const store = await readGeneratedPosts();
  const post = store.posts.find((item) => item.id === postId);
  if (!post) throw new Error("Generated post not found");
  const nextPost: GeneratedPost = {
    ...post,
    ...patch,
    id: post.id,
    sourceItemId: patch.sourceItemId || post.sourceItemId,
    platform: patch.platform || post.platform,
    imageUrls: patch.imageUrls || post.imageUrls,
    materialPaths: patch.materialPaths || post.materialPaths,
    aiNotes: patch.aiNotes || post.aiNotes,
    updatedAt: new Date().toISOString(),
  };
  return await saveGeneratedPost(nextPost);
}

export async function deleteGeneratedPost(postId: string) {
  const store = await readGeneratedPosts();
  if (!store.posts.some((post) => post.id === postId)) throw new Error("Generated post not found");
  await deleteGeneratedPostFromDb(postId);
}

export async function batchUpdateGeneratedPostStatus(postIds: string[], status: GeneratedPost["status"]) {
  const ids = makeUniqueIds(postIds);
  const selectedIds = new Set(ids);
  const foundIds = new Set<string>();
  const updatedPosts = new Map<string, GeneratedPost>();
  const store = await readGeneratedPosts();
  const now = new Date().toISOString();

  store.posts.forEach((post) => {
    if (!selectedIds.has(post.id)) return;
    foundIds.add(post.id);
    const nextPost: GeneratedPost = {
      ...post,
      status,
      updatedAt: now,
    };
    updatedPosts.set(nextPost.id, nextPost);
  });

  if (foundIds.size) await Promise.all(Array.from(updatedPosts.values()).map((post) => saveGeneratedPost(post)));
  return {
    posts: Array.from(updatedPosts.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    updatedCount: foundIds.size,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
  };
}

export async function batchDeleteGeneratedPosts(postIds: string[]) {
  const ids = makeUniqueIds(postIds);
  const selectedIds = new Set(ids);
  const store = await readGeneratedPosts();
  const foundIds = new Set(store.posts.filter((post) => selectedIds.has(post.id)).map((post) => post.id));

  if (foundIds.size) {
    await deleteGeneratedPostsFromDb(Array.from(foundIds));
  }

  return {
    deletedCount: foundIds.size,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
  };
}

export async function makeGeneratedPostVersion(parent: GeneratedPost, nextPost: GeneratedPost) {
  const siblings = (await listGeneratedPosts()).filter((post) => post.parentPostId === parent.id || post.id === parent.id);
  const nextVersion = Math.max(1, ...siblings.map((post) => post.version || 1)) + 1;
  return saveGeneratedPost({
    ...nextPost,
    parentPostId: parent.parentPostId || parent.id,
    version: nextVersion,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function readGeneratedPosts(): Promise<StoredGeneratedPosts> {
  return { posts: await readGeneratedPostsFromDb() };
}

function makeUniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
