import { NextResponse } from "next/server";
import { createSeedancePromptCandidates, SeedancePromptAssistantInputError } from "@/lib/canvas/seedance-prompt-assistant";
import { loadSeedancePromptSkill } from "@/lib/canvas/seedance-skill-loader";
import { callOpenAIForText, callOpenAIForVisionText } from "@/lib/openai";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    const input: unknown = await request.json();
    const result = await createSeedancePromptCandidates(input, {
      generateText: (prompt) => callOpenAIForText(prompt, { logLabel: "Canvas Seedance prompt assistant" }),
      generateVision: (prompt, imageUrls) => callOpenAIForVisionText(prompt, imageUrls, { logLabel: "Canvas Seedance prompt assistant vision" }),
      loadSkill: loadSeedancePromptSkill,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seedance 提示词优化失败。";
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof SeedancePromptAssistantInputError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
