import type { Campaign } from "@/lib/domain/schemas";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { getStorageMode } from "./mode";
import { appendLocalEvents, getLocalCampaign, removeLocalCampaign, saveLocalCampaign } from "./localStore";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

interface BrowserState {
  campaigns: Campaign[];
  deleted: string[];
  events: AnalyticsEvent[];
}

/**
 * JSON fetch helper. In browser-storage mode, mutations carry this browser's copy of the campaign
 * (`__state`) and the server returns what changed, which is saved to localStorage here.
 */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const method = init?.method ?? (init?.body !== undefined ? "POST" : "GET");
  let body = init?.body;
  if (getStorageMode() === "browser" && method !== "GET") {
    const id = /^\/api\/campaigns\/([^/?]+)/.exec(url)?.[1];
    const local = id ? getLocalCampaign(decodeURIComponent(id)) : null;
    body = { ...((body as object) ?? {}), __state: { campaigns: local ? [local] : [] } };
  }
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { __state?: BrowserState };
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status, (data as { fieldErrors?: Record<string, string> }).fieldErrors);
  if (data.__state) {
    for (const c of data.__state.campaigns) {
      if (!saveLocalCampaign(c)) throw new ApiError("This browser's storage is full or blocked, so the change could not be saved.", 507);
    }
    data.__state.deleted.forEach(removeLocalCampaign);
    appendLocalEvents(data.__state.events);
    delete data.__state;
  }
  return data as T;
}
