import { generateCoverAnchoredCards } from "../../src/lib/original-card-orchestrator.ts";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const makeCard = (index) => ({ index, prompt: `prompt-${index}`, candidateUrls: [], status: "planned", qa: { status: "pending", attempts: 0, issues: [] } });

const cards = Array.from({ length: 4 }, (_, index) => makeCard(index));
const generateCalls = [];
const qaCalls = new Map();
await generateCoverAnchoredCards(cards, {
  beforeStage: async () => {},
  generate: async (prompt, references, card) => {
    generateCalls.push({ card: card.index, prompt, references: [...references] });
    const attempt = generateCalls.filter((call) => call.card === card.index).length;
    if (card.index === 3) return {
      status: "pending",
      imageUrls: [],
      providerTaskId: "task-card-3",
      providerTaskRoute: "primary",
      providerStatus: "pending",
      message: "accepted without terminal result",
    };
    return { status: "completed", imageUrls: [`url-${card.index}-${attempt}`] };
  },
  qa: async (card) => {
    const attempt = (qaCalls.get(card.index) || 0) + 1;
    qaCalls.set(card.index, attempt);
    if (card.index === 1 && attempt === 1) return { passed: false, issues: ["漏字"] };
    if (card.index === 2) return { passed: false, unavailable: true, issues: ["vision unavailable"] };
    return { passed: true, issues: [] };
  },
  onUpdate: async () => {},
});

assert(generateCalls[0].card === 0 && generateCalls[0].references.length === 0, "Cover must be the first generation and have no reference.");
assert(generateCalls.slice(1).every((call) => call.references.length === 1 && call.references[0] === "url-0-1"), "Every later generation and retry must use the same cover as sole anchor.");
assert(generateCalls.filter((call) => call.card === 1).length === 2, "A failed QA card must retry exactly once.");
assert(qaCalls.get(1) === 2 && cards[1].candidateUrls.length === 2 && cards[1].status === "completed", "Successful retry must retain both candidates and complete the card.");
assert(generateCalls.filter((call) => call.card === 2).length === 1 && qaCalls.get(2) === 1 && cards[2].status === "needs_review", "Unavailable QA must not spend an image retry.");
assert(generateCalls.filter((call) => call.card === 3).length === 1 && !qaCalls.has(3) && cards[3].status === "generating", "Accepted provider work must remain generating and must not be sent to QA.");
assert(cards[3].providerTaskId === "task-card-3" && cards[3].providerTaskRoute === "primary" && cards[3].providerStatus === "pending", "Accepted provider task identity must remain on the card snapshot.");

const missingCoverCards = [makeCard(0), makeCard(1), makeCard(2)];
let missingCoverGenerateCount = 0;
const pendingCoverResult = await generateCoverAnchoredCards(missingCoverCards, {
  beforeStage: async () => {},
  generate: async () => {
    missingCoverGenerateCount += 1;
    return { status: "pending", imageUrls: [], providerTaskId: "cover-task", providerTaskRoute: "primary", providerStatus: "queued" };
  },
  qa: async () => ({ passed: true, issues: [] }),
  onUpdate: async () => {},
});
assert(missingCoverGenerateCount === 1, "Missing cover must prevent all later provider calls.");
assert(pendingCoverResult.pending === true, "A pending cover must keep the orchestration pass resumable.");
assert(missingCoverCards[0].providerTaskId === "cover-task" && missingCoverCards[0].status === "generating", "Pending cover state must persist its provider task identity.");
assert(missingCoverCards.slice(1).every((card) => card.status === "planned"), "Cards waiting for a pending cover must remain planned instead of failing.");

const pendingResumeCalls = [];
await generateCoverAnchoredCards(missingCoverCards, {
  beforeStage: async () => {},
  generate: async (_prompt, _references, card) => {
    pendingResumeCalls.push({ providerTaskId: card.providerTaskId, providerStatus: card.providerStatus });
    return { status: "completed", imageUrls: [`resumed-${card.index}`] };
  },
  qa: async () => ({ passed: true, issues: [] }),
  onUpdate: async () => {},
});
assert(pendingResumeCalls[0].providerTaskId === "cover-task" && pendingResumeCalls[0].providerStatus === "queued", "A resumed cover must expose the saved provider task to the generation dependency.");
assert(missingCoverCards.every((card) => card.status === "completed"), "The same accepted cover task must resume and unlock all later cards.");

const resumedCards = [makeCard(0), makeCard(1)];
let resumeGenerationCount = 0;
let pauseAtQa = true;
const persistedSnapshots = [];
const resumeDeps = {
  beforeStage: async (stage) => {
    if (stage === "qa" && pauseAtQa) throw new Error("paused");
  },
  generate: async (_prompt, _references, card) => {
    resumeGenerationCount += 1;
    return { status: "completed", imageUrls: [`resume-${card.index}`] };
  },
  qa: async () => ({ passed: true, issues: [] }),
  onUpdate: async (card) => { persistedSnapshots.push({ index: card.index, imageUrl: card.imageUrl, qa: card.qa.status }); },
};
await generateCoverAnchoredCards(resumedCards, resumeDeps).then(
  () => { throw new Error("Pause boundary should reject the active pass."); },
  (error) => assert(error.message === "paused", "Pause boundary error must propagate after active calls settle."),
);
assert(resumeGenerationCount === 1 && persistedSnapshots.some((snapshot) => snapshot.imageUrl === "resume-0" && snapshot.qa === "pending"), "A completed provider result must persist before the QA pause boundary.");
pauseAtQa = false;
await generateCoverAnchoredCards(resumedCards, resumeDeps);
assert(resumeGenerationCount === 2, "Resume must reuse the persisted cover instead of generating it again.");
assert(resumedCards.every((card) => card.status === "completed"), "Resumed cards must finish from their persisted stage.");

const settledCards = [makeCard(0), makeCard(1), makeCard(2)];
let releaseSlowCard;
let slowCardSettled = false;
const slowCardGate = new Promise((resolve) => { releaseSlowCard = resolve; });
const settledRun = generateCoverAnchoredCards(settledCards, {
  beforeStage: async (stage, card) => {
    if (stage === "qa" && card.index === 1) throw new Error("paused");
  },
  generate: async (_prompt, _references, card) => {
    if (card.index === 2) await slowCardGate;
    return { status: "completed", imageUrls: [`settled-${card.index}`] };
  },
  qa: async () => ({ passed: true, issues: [] }),
  onUpdate: async (card) => { if (card.index === 2 && card.imageUrl) slowCardSettled = true; },
});
await new Promise((resolve) => setTimeout(resolve, 0));
let rejectedEarly = false;
settledRun.catch(() => { rejectedEarly = true; });
await new Promise((resolve) => setTimeout(resolve, 0));
assert(!rejectedEarly, "Parallel pause must wait for already-started provider calls to settle.");
releaseSlowCard();
await settledRun.catch((error) => assert(error.message === "paused", "Settled parallel run must preserve the pause error."));
assert(slowCardSettled, "Already-started parallel results must persist before the worker requeues the item.");

console.log("Original card orchestrator mock check passed.");
