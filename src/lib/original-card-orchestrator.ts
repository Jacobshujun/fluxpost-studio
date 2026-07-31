export type OrchestratorCard = {
  index: number;
  prompt: string;
  candidateUrls: string[];
  imageUrl?: string;
  providerTaskId?: string;
  providerTaskRoute?: "primary" | "backup";
  providerStatus?: string;
  status: "planned" | "generating" | "validating" | "completed" | "needs_review" | "failed";
  qa: { status: "pending" | "passed" | "failed" | "unavailable"; attempts: number; issues: string[]; checkedAt?: string };
  error?: string;
};

export type OrchestratorGenerateResult = {
  status: "completed" | "pending" | "needs_config";
  imageUrls: string[];
  providerTaskId?: string;
  providerTaskRoute?: "primary" | "backup";
  providerStatus?: string;
  message?: string;
};
export type OrchestratorQaResult = { passed: boolean; issues: string[]; unavailable?: boolean };

export type OriginalCardOrchestratorDeps<TCard extends OrchestratorCard> = {
  beforeStage: (stage: "generate" | "qa", card: TCard) => Promise<void>;
  generate: (prompt: string, referenceImages: string[], card: TCard) => Promise<OrchestratorGenerateResult>;
  qa: (card: TCard, imageUrl: string) => Promise<OrchestratorQaResult>;
  onUpdate: (card: TCard) => Promise<void>;
};

export async function generateCoverAnchoredCards<TCard extends OrchestratorCard>(cards: TCard[], deps: OriginalCardOrchestratorDeps<TCard>) {
  if (!cards.length) throw new Error("At least one card is required.");
  await generateCard(cards[0], [], deps);
  if (isOriginalCardProviderPending(cards[0])) return { cards, pending: true };
  const coverUrl = cards[0].imageUrl;
  if (!coverUrl) {
    for (const card of cards.slice(1)) {
      card.status = "failed";
      card.error = "封面未生成，无法建立系列风格锚点。";
      await deps.onUpdate(card);
    }
    return { cards, pending: false };
  }
  const results = await Promise.allSettled(cards.slice(1).map((card) => generateCard(card, [coverUrl], deps)));
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected) throw rejected.reason;
  return { cards, pending: cards.some(isOriginalCardProviderPending) };
}

async function generateCard<TCard extends OrchestratorCard>(card: TCard, referenceImages: string[], deps: OriginalCardOrchestratorDeps<TCard>) {
  if (card.imageUrl && (card.status === "completed" || card.status === "needs_review")) return;
  if (isOriginalCardProviderPending(card) || !card.imageUrl) {
    const generated = await generateCandidate(card, card.prompt, referenceImages, deps, Boolean(card.imageUrl || card.candidateUrls.length));
    if (!generated) return;
  }
  await validateCandidate(card, referenceImages, deps);
}

async function validateCandidate<TCard extends OrchestratorCard>(card: TCard, referenceImages: string[], deps: OriginalCardOrchestratorDeps<TCard>) {
  if (card.qa.status === "passed") {
    card.status = "completed";
    await deps.onUpdate(card);
    return;
  }
  if (card.qa.status === "unavailable" || (card.qa.status === "failed" && card.qa.attempts >= 2)) {
    card.status = "needs_review";
    await deps.onUpdate(card);
    return;
  }
  if (card.qa.status === "pending") {
    const qa = await runQa(card, deps);
    card.status = qa.passed ? "completed" : qa.unavailable || card.qa.attempts >= 2 ? "needs_review" : "validating";
    await deps.onUpdate(card);
    if (card.status !== "validating") return;
  }

  const correction = `${card.prompt}\n\n质量修正：${card.qa.issues.join("；")}。保持原有文案、布局与系列风格不变。`;
  const generated = await generateCandidate(card, correction, referenceImages, deps, true);
  if (!generated) return;
  await validateCandidate(card, referenceImages, deps);
}

async function generateCandidate<TCard extends OrchestratorCard>(
  card: TCard,
  prompt: string,
  referenceImages: string[],
  deps: OriginalCardOrchestratorDeps<TCard>,
  isRetry: boolean,
) {
  await deps.beforeStage("generate", card);
  card.status = "generating";
  card.error = undefined;
  await deps.onUpdate(card);
  let result: OrchestratorGenerateResult;
  try {
    result = await deps.generate(prompt, referenceImages, card);
  } catch (error) {
    card.status = isRetry || card.candidateUrls.length ? "needs_review" : "failed";
    card.error = error instanceof Error ? error.message : "图片生成失败。";
    await deps.onUpdate(card);
    return false;
  }
  if (result.status === "pending" && result.providerTaskId) {
    card.providerTaskId = result.providerTaskId;
    card.providerTaskRoute = result.providerTaskRoute;
    card.providerStatus = result.providerStatus || "pending";
    card.status = "generating";
    await deps.onUpdate(card);
    return false;
  }
  if (result.status !== "completed" || !result.imageUrls[0]) {
    markUnavailable(card, result.message || "图片供应商已受理但未返回确定结果，未自动重放。", card.qa.attempts);
    await deps.onUpdate(card);
    return false;
  }
  card.candidateUrls = Array.from(new Set([...card.candidateUrls, result.imageUrls[0]]));
  card.imageUrl = result.imageUrls[0];
  if (card.providerTaskId) card.providerStatus = "completed";
  card.status = "validating";
  card.qa = { status: "pending", attempts: card.qa.attempts, issues: [] };
  await deps.onUpdate(card);
  return true;
}

export function isOriginalCardProviderPending(card: OrchestratorCard) {
  return Boolean(card.providerTaskId && ["pending", "queued", "in_progress"].includes(card.providerStatus || "pending"));
}

async function runQa<TCard extends OrchestratorCard>(card: TCard, deps: OriginalCardOrchestratorDeps<TCard>) {
  await deps.beforeStage("qa", card);
  card.status = "validating";
  try {
    const result = await deps.qa(card, card.imageUrl!);
    card.qa = {
      status: result.unavailable ? "unavailable" : result.passed ? "passed" : "failed",
      attempts: card.qa.attempts + 1,
      issues: result.issues,
      checkedAt: new Date().toISOString(),
    };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "视觉 QA 不可用";
    markUnavailable(card, message, card.qa.attempts + 1);
    return { passed: false, unavailable: true, issues: [message] };
  }
}

function markUnavailable(card: OrchestratorCard, message: string, attempts: number) {
  card.status = "needs_review";
  card.error = message;
  card.qa = { status: "unavailable", attempts, issues: [message], checkedAt: attempts ? new Date().toISOString() : undefined };
}
