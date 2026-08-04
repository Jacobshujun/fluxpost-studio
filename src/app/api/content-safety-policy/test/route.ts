import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  ContentSafetyPolicyValidationError,
  evaluateLocalContentSafety,
  normalizeContentSafetyPolicy,
} from "@/lib/content-safety-policy";
import { assessSourceSafety } from "@/lib/source-safety";
import type { NormalizedSourceItem } from "@/lib/types";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

const maxSampleFieldLength = 5_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) {
      return NextResponse.json({ error: "Only workspace admins can test the content safety policy" }, { status: 403 });
    }
    let body: { policy?: unknown; sample?: unknown; runModel?: unknown };
    try {
      const value = await request.json() as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentSafetyPolicyValidationError("Request body must be a JSON object.");
      }
      body = value as { policy?: unknown; sample?: unknown; runModel?: unknown };
    } catch {
      throw new ContentSafetyPolicyValidationError("Request body must be a valid JSON object.");
    }
    if (body.runModel !== undefined && typeof body.runModel !== "boolean") {
      throw new ContentSafetyPolicyValidationError("runModel must be a boolean.");
    }
    const policy = normalizeContentSafetyPolicy(body.policy);
    const sample = normalizeSample(body.sample);
    const runModel = body.runModel === true;
    const localAssessment = evaluateLocalContentSafety(sample, policy);
    const assessment = runModel
      ? await assessSourceSafety(sample, policy, { forceModel: true })
      : localAssessment;

    if (runModel) {
      const modelSkipped = assessment.source === "local" && assessment.status !== "failed";
      await recordExecutionLog({
        scope: "content-safety/policy",
        action: assessment.status === "failed"
          ? "Content safety policy model test failed"
          : modelSkipped
            ? "Content safety policy model test skipped"
            : "Content safety policy model tested",
        status: assessment.status === "failed" ? "error" : modelSkipped ? "info" : "success",
        message: assessment.status === "failed"
          ? "Content safety policy model test failed; the local result was preserved."
          : modelSkipped
            ? "Content safety policy model test skipped without a provider call."
            : "Content safety policy model test completed.",
        ownerUserId: account.id,
        ownerDisplayName: account.displayName,
        durationMs: Date.now() - startedAt,
        details: {
          policyRevision: policy.revision,
          localDecision: localAssessment.decision,
          finalDecision: assessment.decision,
          modelStatus: assessment.status,
          modelSkipped,
          riskScore: assessment.riskScore ?? null,
          matchedRuleId: localAssessment.matchedRuleId || null,
          reviewThreshold: policy.model.reviewThreshold,
          filterThreshold: policy.model.filterThreshold,
          actorId: account.id,
          actorDisplayName: account.displayName,
        },
      });
    }
    return NextResponse.json({ policy, localAssessment, assessment });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof ContentSafetyPolicyValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 401 ? "Workspace sign-in required" : compactError(error) }, { status });
  }
}

function normalizeSample(value: unknown): NormalizedSourceItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContentSafetyPolicyValidationError("sample must be an object.");
  }
  const input = value as Record<string, unknown>;
  const title = sampleField(input.title, "sample.title");
  const contentText = sampleField(input.contentText, "sample.contentText");
  const authorName = sampleField(input.authorName, "sample.authorName");
  if (!title && !contentText && !authorName) {
    throw new ContentSafetyPolicyValidationError("sample must include title, contentText, or authorName.");
  }
  return {
    id: "content-safety-policy-test",
    sourceId: "content-safety-policy-test",
    platform: "douyin",
    title,
    contentText,
    authorName,
    mediaType: "text",
    images: [],
    mediaUrls: [],
    metrics: {},
    raw: {},
  };
}

function sampleField(value: unknown, name: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ContentSafetyPolicyValidationError(`${name} must be a string.`);
  if (value.length > maxSampleFieldLength) {
    throw new ContentSafetyPolicyValidationError(`${name} must be at most ${maxSampleFieldLength} characters.`);
  }
  return value;
}
