import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  buildFeishuPublishJobResponse,
  enqueueFeishuPublishJob,
  getFeishuPublishJob,
  listFeishuPublishJobs,
} from "@/lib/feishu-publish-queue";
import { listFeishuVehicleOptions, normalizeFeishuVehicleValue } from "@/lib/feishu-field-options";
import { getGeneratedPost } from "@/lib/generated-posts";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { GeneratedPost } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const account = await requireWorkspaceAccount(request);
    const jobId = url.searchParams.get("jobId")?.trim();
    if (jobId) {
      const job = await getFeishuPublishJob(jobId, account);
      if (!job) return NextResponse.json({ error: "Feishu publish job not found" }, { status: 404 });
      return NextResponse.json(buildFeishuPublishJobResponse(job));
    }

    const jobs = await listFeishuPublishJobs(50, account);
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = compactError(error);
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { posts?: GeneratedPost[] };
    const requestedPosts = Array.isArray(body.posts) ? body.posts : [];
    if (!requestedPosts.length) {
      await recordExecutionLog({
        scope: "publish/feishu",
        action: "Feishu publish enqueue validation failed",
        status: "error",
        message: "At least one approved post is required.",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "At least one approved post is required" }, { status: 400 });
    }
    const posts = (
      await Promise.all(
        requestedPosts.map(async (post) => {
          if (!post?.id) return undefined;
          return getGeneratedPost(post.id, account);
        }),
      )
    ).filter((post): post is GeneratedPost => Boolean(post));
    if (!posts.length || posts.length !== requestedPosts.length) {
      return NextResponse.json({ error: "One or more posts were not found" }, { status: 404 });
    }

    const postsForPublish = await normalizePostsForFeishuPublish(posts);

    const job = await enqueueFeishuPublishJob(postsForPublish, {
      source: "manual",
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });

    await recordExecutionLog({
      scope: "publish/feishu",
      action: "Feishu publish enqueue completed",
      status: "info",
      message: `Feishu publish job ${job.id} queued for ${job.postIds.length} post(s).`,
      durationMs: Date.now() - startedAt,
      details: {
        jobId: job.id,
        postCount: job.postIds.length,
        ownerUserId: job.ownerUserId,
      },
    });

    return NextResponse.json(
      {
        ...buildFeishuPublishJobResponse(job),
        message: `Feishu publish job ${job.id} has been queued. Feishu CLI writes will run in the per-user queue.`,
        postStates: [],
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue Feishu publish job";
    await recordExecutionLog({
      scope: "publish/feishu",
      action: "Feishu publish enqueue failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : 500 });
  }
}

async function normalizePostsForFeishuPublish(posts: GeneratedPost[]) {
  const vehicleOptions = await listFeishuVehicleOptions();
  if (!vehicleOptions.options.length) return posts;

  return posts.map((post) => {
    const rawVehicle = post.feishuVehicle || post.taskKeyword || "";
    const normalized = normalizeFeishuVehicleValue(rawVehicle, vehicleOptions.options);
    if (!normalized.matched) {
      throw new Error(
        `Feishu ${vehicleOptions.fieldName} option not found: ${normalized.value}. Please select an existing ${vehicleOptions.fieldName} before publishing.`,
      );
    }
    return {
      ...post,
      feishuVehicle: normalized.value || undefined,
    };
  });
}
