"use client";

import { setStorageMode, type StorageMode } from "./mode";

/** Publishes the deployment's storage mode to client code (set during render so it is ready before any click). */
export function ModeSetter({ mode }: { mode: StorageMode }) {
  setStorageMode(mode);
  return null;
}
