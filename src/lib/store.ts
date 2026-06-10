import {
  getCrawlJobFromDb,
  getRuntimePostFromDb,
  listCrawlJobsFromDb,
  listRuntimePostsFromDb,
  saveCrawlJobToDb,
  saveRuntimePostToDb,
} from "./database";
import { applyWorkspaceOwner, canAccessWorkspaceOwner, filterWorkspaceOwnedRecords, type WorkspaceAccessActor } from "./workspace-ownership";
import type { CrawlJob, GeneratedPost } from "./types";

export async function saveJob(job: CrawlJob, account?: WorkspaceAccessActor) {
  return saveCrawlJobToDb(applyWorkspaceOwner(job, account, job));
}

export async function getJob(id: string, account?: WorkspaceAccessActor) {
  const job = await getCrawlJobFromDb(id);
  if (!job || (account && !canAccessWorkspaceOwner(account, job.ownerUserId))) return undefined;
  return job;
}

export async function listJobs(account?: WorkspaceAccessActor) {
  return filterWorkspaceOwnedRecords(await listCrawlJobsFromDb(), account);
}

export async function savePost(post: GeneratedPost, account?: WorkspaceAccessActor) {
  return saveRuntimePostToDb(applyWorkspaceOwner(post, account, post));
}

export async function getPost(id: string, account?: WorkspaceAccessActor) {
  const post = await getRuntimePostFromDb(id);
  if (!post || (account && !canAccessWorkspaceOwner(account, post.ownerUserId))) return undefined;
  return post;
}

export async function listPosts(account?: WorkspaceAccessActor) {
  return filterWorkspaceOwnedRecords(await listRuntimePostsFromDb(), account);
}
