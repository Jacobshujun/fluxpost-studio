export const FINISHED_BODY_TARGET_CHARS = 800;
export const FINISHED_BODY_MAX_CHARS = 1000;
export const FINISHED_BODY_POLICY_VERSION = 1 as const;

export const FINISHED_BODY_TARGET_INSTRUCTION =
  `正文以约 ${FINISHED_BODY_TARGET_CHARS} 个字符为目标，最多不得超过 ${FINISHED_BODY_MAX_CHARS} 个字符；字符包含标点、空格、换行和 emoji。`;

export type FinishedBodyPolicyRecord = {
  body: string;
  bodyPolicyVersion?: typeof FINISHED_BODY_POLICY_VERSION;
};

export function countFinishedBodyChars(value: string) {
  return Array.from(value.trim()).length;
}

export function clampFinishedBodyInput(value: string) {
  const normalized = value.trim();
  if (countFinishedBodyChars(normalized) <= FINISHED_BODY_MAX_CHARS) return value;
  return Array.from(normalized).slice(0, FINISHED_BODY_MAX_CHARS).join("");
}

export function truncateFinishedBody(value: string) {
  const normalized = value.trim();
  const characters = Array.from(normalized);
  if (characters.length <= FINISHED_BODY_MAX_CHARS) return normalized;

  const limited = characters.slice(0, FINISHED_BODY_MAX_CHARS);
  for (let index = limited.length - 1; index >= 0; index -= 1) {
    if (!(/[.!?]|\u3002|\uFF01|\uFF1F|\u2026/u.test(limited[index]))) continue;
    let sentenceEnd = index + 1;
    while (sentenceEnd < limited.length && /["'\u2019\u201D\u3009\u300B\u300D\u300F\u3011\u3015\u3017\u3019\u301B\uFF09\uFF3D\uFF5D]/u.test(limited[sentenceEnd])) {
      sentenceEnd += 1;
    }
    return limited.slice(0, sentenceEnd).join("").trim();
  }
  return limited.join("").trim();
}

export function applyFinishedBodyPolicy(
  candidate: FinishedBodyPolicyRecord,
  previous?: FinishedBodyPolicyRecord,
): FinishedBodyPolicyRecord {
  const governed = !previous
    || candidate.bodyPolicyVersion === FINISHED_BODY_POLICY_VERSION
    || previous.bodyPolicyVersion === FINISHED_BODY_POLICY_VERSION
    || candidate.body !== previous.body;
  if (!governed) return { body: candidate.body };
  return {
    body: truncateFinishedBody(candidate.body),
    bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
  };
}

export function isFinishedBodyPolicyCompliant(record: FinishedBodyPolicyRecord) {
  return record.bodyPolicyVersion !== FINISHED_BODY_POLICY_VERSION
    || countFinishedBodyChars(record.body) <= FINISHED_BODY_MAX_CHARS;
}
