import { createHash } from "node:crypto";

export const referenceHash = (value) => createHash("sha256").update(value).digest("hex");

export function createReferenceRewriter({ sourceOrigin, targetOrigin, prefix, verifiedKeys }) {
  for (const origin of [sourceOrigin, targetOrigin]) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) {
      throw new Error("InvalidStorageOrigin");
    }
  }
  if (sourceOrigin === targetOrigin || !prefix.endsWith("/") || !(verifiedKeys instanceof Set)) {
    throw new Error("InvalidReferenceScope");
  }
  const sourcePrefix = `${sourceOrigin}/`;

  function replaceUrl(value) {
    if (!value.startsWith(sourcePrefix)) return value;
    const pathEnd = value.search(/[?#]/);
    const rawPath = value.slice(sourcePrefix.length, pathEnd < 0 ? undefined : pathEnd);
    let key;
    let url;
    try {
      key = decodeURIComponent(rawPath);
      url = new URL(value);
    } catch {
      return value;
    }
    if (!key.startsWith(prefix) || key.includes("\\") || key.split("/").some((part) => part === "." || part === "..") ||
        !verifiedKeys.has(key) || url.origin !== sourceOrigin ||
        [...url.searchParams.keys()].some((name) => /signature|credential|security-token|accesskey|expires|^x-tos-|^x-amz-/i.test(name))) {
      return value;
    }
    return targetOrigin + value.slice(sourceOrigin.length);
  }

  function replaceString(value) {
    const direct = /\s/.test(value) && /[?#]/.test(value) ? value : replaceUrl(value);
    if (direct !== value) return direct;
    return value.replace(/https:\/\/[^\s<>"'\\]+/g, (token) => {
      const exact = replaceUrl(token);
      if (exact !== token) return exact;
      // Markdown/prose punctuation is not part of a key unless the full key exists.
      let end = token.length;
      while (end > 0 && /[)\],.;:!?]/.test(token[end - 1])) {
        end--;
        const candidate = token.slice(0, end);
        const replacement = replaceUrl(candidate);
        if (replacement !== candidate) return replacement + token.slice(end);
      }
      return token;
    });
  }

  return function rewrite(value, json = true) {
    const patches = [];
    let output = "";
    let cursor = 0;
    if (json) {
      // Rewrite string values only. Keep numeric lexemes and object keys untouched.
      const strings = /"(?:[^"\\]|\\.)*"/g;
      for (const match of value.matchAll(strings)) {
        const start = match.index;
        const end = start + match[0].length;
        if (/^\s*:/.test(value.slice(end))) continue;
        const oldString = JSON.parse(match[0]);
        const newString = replaceString(oldString);
        if (oldString === newString) continue;
        output += value.slice(cursor, start);
        const after = JSON.stringify(newString);
        patches.push({ start: output.length, before: match[0], after });
        output += after;
        cursor = end;
      }
      output += value.slice(cursor);
    } else {
      output = replaceString(value);
      if (output !== value) patches.push({ start: 0, before: value, after: output });
    }
    return { value: output, patches, beforeHash: referenceHash(value), afterHash: referenceHash(output) };
  };
}

export function restoreReferenceValue(value, receipt) {
  if (referenceHash(value) !== receipt.afterHash) throw new Error("RollbackConcurrentChange");
  const pieces = [];
  let cursor = 0;
  for (const patch of receipt.patches) {
    if (patch.start < cursor || value.slice(patch.start, patch.start + patch.after.length) !== patch.after) throw new Error("RollbackPatchMismatch");
    pieces.push(value.slice(cursor, patch.start), patch.before);
    cursor = patch.start + patch.after.length;
  }
  pieces.push(value.slice(cursor));
  const output = pieces.join("");
  if (referenceHash(output) !== receipt.beforeHash) throw new Error("RollbackDigestMismatch");
  return output;
}
