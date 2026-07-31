export function normalizeFeishuTableId(value: string) {
  return value.trim().replace(/[?&]view=[^#]*/i, "");
}
