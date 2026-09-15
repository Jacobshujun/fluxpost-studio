import type { CanvasScheduleParameterSource, CanvasScheduleParameterType, CanvasScheduleParameterValue } from "./types";

type ScalarSource = Extract<CanvasScheduleParameterSource, { mode: "fixed" | "manual-list" }>;

export function formatCanvasScheduleScalarValues(source: ScalarSource) {
  return source.values.map(String).join(source.listSeparator === "delimiter" ? "\n---\n" : "\n");
}

export function parseCanvasScheduleScalarValues(
  valueType: CanvasScheduleParameterType,
  value: string,
  mode: ScalarSource["mode"],
  listSeparator: ScalarSource["listSeparator"] = "line",
) {
  if (valueType === "text" && mode === "fixed") return [value];
  const separator = valueType === "text" && listSeparator === "delimiter" ? /^[\t ]*---[\t ]*$/m : /\n/;
  const entries = value.replace(/\r\n?/g, "\n").split(separator).map((item) => item.trim())
    .filter((item, index) => item || (mode === "fixed" && index === 0));
  const selected = mode === "fixed" ? entries.slice(0, 1) : entries;
  return (selected.length ? selected : [""]).map((item): CanvasScheduleParameterValue => {
    if (valueType === "number") return Number(item || 0);
    if (valueType === "boolean") return ["true", "1", "\u662f", "yes"].includes(item.toLowerCase());
    return item;
  });
}
