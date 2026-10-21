export const textReasoningEffortValues = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type TextReasoningEffort = (typeof textReasoningEffortValues)[number];

export type TextReasoningRequest =
  | { reasoning: { effort: Exclude<TextReasoningEffort, "default"> } }
  | { reasoning_effort: Exclude<TextReasoningEffort, "default"> }
  | Record<string, never>;

export function normalizeTextReasoningEffort(value: string | undefined): TextReasoningEffort {
  const normalized = value?.trim().toLowerCase() || "default";
  if (!textReasoningEffortValues.includes(normalized as TextReasoningEffort)) {
    throw new Error(
      `OPENAI_TEXT_REASONING_EFFORT must be one of ${textReasoningEffortValues.join(", ")}.`,
    );
  }
  return normalized as TextReasoningEffort;
}

export function buildTextReasoningRequest(
  endpoint: string,
  effort: TextReasoningEffort,
): TextReasoningRequest {
  if (effort === "default") return {};
  const effortValue = effort as Exclude<TextReasoningEffort, "default">;
  return endpoint === "chat"
    ? { reasoning_effort: effortValue }
    : { reasoning: { effort: effortValue } };
}
