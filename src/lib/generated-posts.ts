import {
  deleteGeneratedPostFromDb,
  deleteGeneratedPostsFromDb,
  readGeneratedPostsFromDb,
  getGeneratedPostFromDb,
  getGeneratedPostsByIdsFromDb,
  saveGeneratedPostToDb,
} from "./database";
import {
  accessActorFromOwner,
  applyWorkspaceOwner,
  assertCanAccessWorkspaceRecord,
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  type WorkspaceAccessActor,
} from "./workspace-ownership";
import { clampGeneratedTitleMax } from "./title-guard";
import { applyFinishedBodyPolicy } from "./finished-body-policy";
import type { GeneratedPost } from "./types";

type StoredGeneratedPosts = {
  posts: GeneratedPost[];
};

export async function listGeneratedPosts(account?: WorkspaceAccessActor) {
  const store = await readGeneratedPosts();
  return filterWorkspaceOwnedRecords(store.posts, account).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGeneratedPost(postId: string, account?: WorkspaceAccessActor) {
  const post = await getGeneratedPostFromDb(postId);
  return post && canReadGeneratedPost(account, post) ? post : undefined;
}

export async function getGeneratedPostsByIds(postIds: string[], account?: WorkspaceAccessActor) {
  const ids = makeUniqueIds(postIds);
  if (!ids.length) return [];
  const selectedIds = new Set(ids);
  const store = { posts: await getGeneratedPostsByIdsFromDb(ids) };
  const postsById = new Map(
    store.posts
      .filter((post) => selectedIds.has(post.id) && canReadGeneratedPost(account, post))
      .map((post) => [post.id, post]),
  );
  return ids.map((id) => postsById.get(id)).filter((post): post is GeneratedPost => Boolean(post));
}

export async function saveGeneratedPost(post: GeneratedPost, account?: WorkspaceAccessActor) {
  const previous = await getGeneratedPostFromDb(post.id);
  const access = account || accessActorFromOwner(post.ownerUserId, post.ownerDisplayName);
  if (previous && access) assertCanAccessWorkspaceRecord(access, previous, "Generated post not found");
  const ownerAccount = previous ? undefined : account;
  const finishedBody = applyFinishedBodyPolicy(post, previous);
  const nextPost: GeneratedPost = {
    ...applyWorkspaceOwner(post, ownerAccount, previous || post),
    ...finishedBody,
    title: clampGeneratedTitleMax(post.title, ""),
    createdAt: post.createdAt || previous?.createdAt || new Date().toISOString(),
    version: post.version || previous?.version || 1,
    updatedAt: post.updatedAt || new Date().toISOString(),
  };
  await saveGeneratedPostToDb(nextPost);
  return nextPost;
}

export async function updateGeneratedPost(postId: string, patch: Partial<GeneratedPost>, account?: WorkspaceAccessActor) {
  const post = await getGeneratedPost(postId, account);
  if (!post) throw new Error("Generated post not found");
  const nextPost: GeneratedPost = {
    ...post,
    ...patch,
    id: post.id,
    ownerUserId: post.ownerUserId,
    ownerDisplayName: post.ownerDisplayName,
    sourceItemId: patch.sourceItemId || post.sourceItemId,
    platform: patch.platform || post.platform,
    imageUrls: patch.imageUrls || post.imageUrls,
    materialPaths: patch.materialPaths || post.materialPaths,
    aiNotes: patch.aiNotes || post.aiNotes,
    updatedAt: new Date().toISOString(),
  };
  return await saveGeneratedPost(nextPost, account);
}

export async function deleteGeneratedPost(postId: string, account?: WorkspaceAccessActor) {
  if (!(await getGeneratedPost(postId, account))) throw new Error("Generated post not found");
  await deleteGeneratedPostFromDb(postId);
}

export async function batchUpdateGeneratedPostStatus(postIds: string[], status: GeneratedPost["status"], account?: WorkspaceAccessActor) {
  const ids = makeUniqueIds(postIds);
  const selectedIds = new Set(ids);
  const foundIds = new Set<string>();
  const updatedPosts = new Map<string, GeneratedPost>();
  const store = { posts: await getGeneratedPostsByIdsFromDb(ids) };
  const now = new Date().toISOString();

  store.posts.forEach((post) => {
    if (!selectedIds.has(post.id) || !canReadGeneratedPost(account, post)) return;
    foundIds.add(post.id);
    const nextPost: GeneratedPost = {
      ...post,
      status,
      updatedAt: now,
    };
    updatedPosts.set(nextPost.id, nextPost);
  });

  const persistedPosts = foundIds.size
    ? await Promise.all(Array.from(updatedPosts.values()).map((post) => saveGeneratedPost(post, account)))
    : [];
  return {
    posts: persistedPosts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    updatedCount: foundIds.size,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
  };
}

export async function batchDeleteGeneratedPosts(postIds: string[], account?: WorkspaceAccessActor) {
  const ids = makeUniqueIds(postIds);
  const selectedIds = new Set(ids);
  const store = { posts: await getGeneratedPostsByIdsFromDb(ids) };
  const foundIds = new Set(store.posts.filter((post) => selectedIds.has(post.id) && canReadGeneratedPost(account, post)).map((post) => post.id));

  if (foundIds.size) {
    await deleteGeneratedPostsFromDb(Array.from(foundIds));
  }

  return {
    deletedCount: foundIds.size,
    notFoundIds: ids.filter((id) => !foundIds.has(id)),
  };
}

export async function makeGeneratedPostVersion(parent: GeneratedPost, nextPost: GeneratedPost, account?: WorkspaceAccessActor) {
  const access = account || accessActorFromOwner(parent.ownerUserId, parent.ownerDisplayName);
  if (access) assertCanAccessWorkspaceRecord(access, parent, "Generated post not found");
  const siblings = (await listGeneratedPosts(account)).filter((post) => post.parentPostId === parent.id || post.id === parent.id);
  const nextVersion = Math.max(1, ...siblings.map((post) => post.version || 1)) + 1;
  return saveGeneratedPost({
    ...nextPost,
    ownerUserId: parent.ownerUserId || nextPost.ownerUserId,
    ownerDisplayName: parent.ownerDisplayName || nextPost.ownerDisplayName,
    parentPostId: parent.parentPostId || parent.id,
    version: nextVersion,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, access);
}

async function readGeneratedPosts(): Promise<StoredGeneratedPosts> {
  return { posts: await readGeneratedPostsFromDb() };
}

function makeUniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function canReadGeneratedPost(account: WorkspaceAccessActor | undefined, post: GeneratedPost) {
  if (!account) return true;
  return canAccessWorkspaceOwner(account, post.ownerUserId);
}
