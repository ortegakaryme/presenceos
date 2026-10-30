import { AsyncLocalStorage } from "node:async_hooks";
import type { Campaign } from "@/lib/domain/schemas";
import type { AnalyticsEvent } from "@/lib/analytics/events";

/**
 * Per-request context (server only).
 * - `overlay`: an in-request working copy of campaign state. Used when the browser is the
 *   source of truth (no shared storage), and to build example campaigns in isolation.
 * - `nextId`: deterministic id generator for this context.
 */
export interface Overlay {
  campaigns: Map<string, Campaign>;
  /** Ids written during this request — returned to the browser. */
  touched: Set<string>;
  deleted: Set<string>;
  events: AnalyticsEvent[];
  /** Whether reads fall through to the shared/base store (for examples). */
  readThrough: boolean;
  /** Locks are scoped to the overlay, so a nested isolated build never waits on its caller's lock. */
  locks: Map<string, Promise<unknown>>;
}

export interface RequestContext {
  overlay?: Overlay;
  nextId?: (prefix: string) => string;
}

const g = globalThis as unknown as { __presenceAls?: AsyncLocalStorage<RequestContext>; __presenceIdGen?: (p: string) => string | undefined };
export const requestContext: AsyncLocalStorage<RequestContext> = (g.__presenceAls ??= new AsyncLocalStorage<RequestContext>());
g.__presenceIdGen = (prefix) => requestContext.getStore()?.nextId?.(prefix);

export function newOverlay(campaigns: Campaign[] = [], readThrough = true): Overlay {
  return { campaigns: new Map(campaigns.map((c) => [c.id, c])), touched: new Set(), deleted: new Set(), events: [], readThrough, locks: new Map() };
}
