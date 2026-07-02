import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { enqueueDistributionCheckJob, getDistributionCheckJob, listDistributionCheckJobs } from "@/lib/distribution-check";
import { getWorkspacePromptSettings } from "@/lib/workspace-settings";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId")?.trim();
    if (jobId) {
      const job = await getDistributionCheckJob(jobId, account);
      if (!job) return NextResponse.json({ error: "Distribution check job not found" }, { status: 404 });
      return NextResponse.json({ job });
    }

    const jobs = await listDistributionCheckJobs(30, account);
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
    const body = (await request.json()) as { numbers?: string[] | string; prompt?: string };
    const settings = await getWorkspacePromptSettings();
    const job = await enqueueDistributionCheckJob(body.numbers, {
      prompt: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : settings.distributionCheckPrompt,
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });
    return NextResponse.json({ status: "queued", jobId: job.id, job }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Distribution check enqueue failed";
    await recordExecutionLog({
      scope: "feishu/distribution-check",
      action: "Distribution check enqueue failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = /sign-in/i.test(message) ? 401 : /required|config|number/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
