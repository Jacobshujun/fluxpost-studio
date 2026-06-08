import {
  getCrawlJobFromDb,
  getRuntimePostFromDb,
  listCrawlJobsFromDb,
  listRuntimePostsFromDb,
  saveCrawlJobToDb,
  saveRuntimePostToDb,
} from "./database";
import type { CrawlJob, GeneratedPost } from "./types";

export async function saveJob(job: CrawlJob) {
  return saveCrawlJobToDb(job);
}

export async function getJob(id: string) {
  return getCrawlJobFromDb(id);
}

export async function listJobs() {
  return listCrawlJobsFromDb();
}

export async function savePost(post: GeneratedPost) {
  return saveRuntimePostToDb(post);
}

export async function getPost(id: string) {
  return getRuntimePostFromDb(id);
}

export async function listPosts() {
  return listRuntimePostsFromDb();
}
