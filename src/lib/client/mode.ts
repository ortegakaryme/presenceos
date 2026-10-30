"use client";

export type StorageMode = "server" | "browser";

const g = globalThis as unknown as { __presenceMode?: StorageMode };

export function setStorageMode(m: StorageMode) {
  g.__presenceMode = m;
}

export function getStorageMode(): StorageMode {
  return g.__presenceMode ?? "server";
}
