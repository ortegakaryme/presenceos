/**
 * Works in Node and the browser (Web Crypto). On the server a request context can install a
 * deterministic generator (used to build example campaigns identically on every instance).
 */
type IdGen = (prefix: string) => string | undefined;

export function newId(prefix: string): string {
  const fixed = (globalThis as { __presenceIdGen?: IdGen }).__presenceIdGen?.(prefix);
  if (fixed) return fixed;
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Deterministic id sequence for a seed, e.g. "casa-brisa" → chg_1a2b3c0001, chg_1a2b3c0002 … */
export function sequentialIds(seed: string): (prefix: string) => string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const stem = h.toString(16).padStart(8, "0").slice(0, 6);
  let n = 0;
  return (prefix) => `${prefix}_${stem}${(++n).toString(16).padStart(4, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
