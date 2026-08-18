import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  buildFeishuPublishJobResponse,
  enqueueFeishuPublishJob,
  getFeishuPublishJob,
  listFeishuPublishJobs,
} from "@/lib/feishu-publish-queue";
import { getGeneratedPostsByIds } from "@/lib/generated-posts";
import { normalizeFeishuPublishMode } from "@/lib/feishu-publish-mode";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const account = await requireWorkspaceAccount(request);
    const jobId = url.searchParams.get("jobId")?.trim();
    if (jobId) {
      const job = await getFeishuPublishJob(jobId, account);
      if (!job) return NextResponse.json({ error: "Feishu publish job not found" }, { status: 404 });
      return NextResponse.json(await buildFeishuPublishJobResponse(job));
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
    const body = (await request.json()) as { postIds?: string[]; publishMode?: unknown };
    const postIds = normalizePostIds(body.postIds);
    let publishMode;
    try {
      publishMode = normalizeFeishuPublishMode(body.publishMode);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Feishu publish mode" }, { status: 400 });
    }
    if (!postIds.length) {
      await recordExecutionLog({
        scope: "publish/feishu",
        action: "Feishu publish enqueue validation failed",
        status: "error",
        message: "At least one approved post is required.",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "At least one approved post is required" }, { status: 400 });
    }
    const posts = await getGeneratedPostsByIds(postIds, account);
    if (!posts.length || posts.length !== postIds.length) {
      return NextResponse.json({ error: "One or more posts were not found" }, { status: 404 });
    }

    const job = await enqueueFeishuPublishJob(posts, {
      source: "manual",
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
      publishMode,
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
        publishMode: job.publishMode,
      },
    });

    return NextResponse.json(
      {
        ...(await buildFeishuPublishJobResponse(job)),
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
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : /publish mode/i.test(message) ? 400 : 500 });
  }
}

function normalizePostIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
}
