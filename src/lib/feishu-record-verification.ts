export type FeishuRecordFieldExpectation = {
  recordId: string;
  fields: Record<string, unknown>;
};

export type FeishuRecordFieldFailure = {
  recordId: string;
  reason: "invalid_json" | "invalid_response" | "not_found" | "missing_record" | "field_mismatch";
  error: string;
};

export function verifyFeishuRecordFields(
  stdout: string,
  expectations: FeishuRecordFieldExpectation[],
): FeishuRecordFieldFailure[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return expectations.map((item) => ({
      recordId: item.recordId,
      reason: "invalid_json" as const,
      error: "Feishu record read-back returned invalid JSON.",
    }));
  }

  const result = findRecordReadResult(parsed);
  if (!result) {
    return expectations.map((item) => ({
      recordId: item.recordId,
      reason: "invalid_response" as const,
      error: "Feishu record read-back did not include record data.",
    }));
  }

  const missing = new Set(result.record_not_found || []);
  return expectations.flatMap<FeishuRecordFieldFailure>((expectation) => {
    if (missing.has(expectation.recordId)) {
      return [{
        recordId: expectation.recordId,
        reason: "not_found" as const,
        error: "Feishu record was not found during read-back verification.",
      }];
    }

    const rowIndex = result.record_id_list.indexOf(expectation.recordId);
    const row = rowIndex >= 0 ? result.data[rowIndex] : undefined;
    if (!Array.isArray(row)) {
      return [{
        recordId: expectation.recordId,
        reason: "missing_record" as const,
        error: "Feishu record read-back omitted the expected record.",
      }];
    }

    const mismatchedFields = Object.entries(expectation.fields)
      .filter(([fieldName, expected]) => {
        const fieldIndex = result.fields.indexOf(fieldName);
        return fieldIndex < 0 || !cellValuesEqual(row[fieldIndex], expected);
      })
      .map(([fieldName]) => fieldName);
    return mismatchedFields.length
      ? [{
          recordId: expectation.recordId,
          reason: "field_mismatch" as const,
          error: `Feishu record read-back mismatch for field(s): ${mismatchedFields.join(", ")}.`,
        }]
      : [];
  });
}

function findRecordReadResult(value: unknown): RecordReadResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    Array.isArray(record.fields) &&
    record.fields.every((item) => typeof item === "string") &&
    Array.isArray(record.record_id_list) &&
    record.record_id_list.every((item) => typeof item === "string") &&
    Array.isArray(record.data)
  ) {
    return {
      fields: record.fields as string[],
      record_id_list: record.record_id_list as string[],
      data: record.data as unknown[][],
      record_not_found: Array.isArray(record.record_not_found)
        ? record.record_not_found.filter((item): item is string => typeof item === "string")
        : undefined,
    };
  }
  for (const child of Object.values(record)) {
    const result = findRecordReadResult(child);
    if (result) return result;
  }
  return undefined;
}

function cellValuesEqual(actual: unknown, expected: unknown) {
  if (expected === "") return actual === null || actual === undefined || actual === "";
  if (Array.isArray(expected)) {
    const expectedValues = expected.map(String).sort();
    const actualValues = Array.isArray(actual) ? actual.map(String).sort() : [];
    return JSON.stringify(actualValues) === JSON.stringify(expectedValues);
  }
  return actual === expected;
}

type RecordReadResult = {
  fields: string[];
  record_id_list: string[];
  data: unknown[][];
  record_not_found?: string[];
};
