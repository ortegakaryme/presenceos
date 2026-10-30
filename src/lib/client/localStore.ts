"use client";

import { useSyncExternalStore } from "react";
import type { Campaign } from "@/lib/domain/schemas";
import type { AnalyticsEvent } from "@/lib/analytics/events";

/**
 * Browser persistence for deployments without shared server storage. Each visitor's campaigns
 * (and their copies of examples they changed) live in this browser only. Every access is wrapped:
 * private windows, blocked storage or a full quota must never break the page.
 */
const P = "presenceos:v1:";
const INDEX = `${P}campaigns`;
const EVENTS = `${P}events`;
const MAX_EVENTS = 1500;
const REV = `${P}rev`;
const CHANGE = "presenceos-local-change";

function bump() {
  try {
    window.localStorage.setItem(REV, String(Date.now()) + Math.random().toString(36).slice(2, 6));
    window.dispatchEvent(new Event(CHANGE));
  } catch {
    // ignore
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

function snapshot(): string {
  try {
    return window.localStorage.getItem(REV) ?? "0";
  } catch {
    return "unavailable";
  }
}

/**
 * Changes whenever this browser's saved campaigns change. `null` during server rendering and
 * hydration, so callers render the server copy first and switch to local data right after.
 */
export function useLocalRevision(): string | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded: drop old analytics events first, then retry once.
    try {
      window.localStorage.setItem(EVENTS, JSON.stringify(read<AnalyticsEvent[]>(EVENTS, []).slice(-200)));
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

export function getLocalCampaign(id: string): Campaign | null {
  return read<Campaign | null>(`${P}campaign:${id}`, null);
}

export function listLocalCampaigns(): Campaign[] {
  return read<string[]>(INDEX, [])
    .map(getLocalCampaign)
    .filter((c): c is Campaign => !!c);
}

export function saveLocalCampaign(c: Campaign): boolean {
  const ok = write(`${P}campaign:${c.id}`, c);
  if (ok) {
    const ids = read<string[]>(INDEX, []);
    if (!ids.includes(c.id)) write(INDEX, [...ids, c.id]);
    bump();
  }
  return ok;
}

export function removeLocalCampaign(id: string) {
  try {
    window.localStorage.removeItem(`${P}campaign:${id}`);
  } catch {
    // ignore
  }
  write(INDEX, read<string[]>(INDEX, []).filter((x) => x !== id));
  bump();
}

export function listLocalEvents(): AnalyticsEvent[] {
  return read<AnalyticsEvent[]>(EVENTS, []);
}

export function appendLocalEvents(events: AnalyticsEvent[]) {
  if (!events.length) return;
  write(EVENTS, [...listLocalEvents(), ...events].slice(-MAX_EVENTS));
  bump();
}
