export const EVENT_NAMES = [
  "property_brief_submitted",
  "agent_run_started",
  "agent_run_completed",
  "agent_run_failed",
  "campaign_draft_created",
  "proposal_approved",
  "proposal_rejected",
  "proposal_edited",
  "changes_applied",
  "campaign_preview_opened",
  "qa_issue_detected",
  "campaign_approved",
  "iteration_started",
  "version_restored",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Events the browser may report. Everything else is emitted server-side by the Builder. */
export const CLIENT_EVENTS: EventName[] = ["campaign_preview_opened"];

export interface AnalyticsEvent {
  id: string;
  name: EventName;
  at: string;
  campaignId?: string;
  props: Record<string, unknown>;
}

/**
 * Integration point for an external product-analytics tool. Intentionally a no-op:
 * events are stored locally only. To forward them (e.g. PostHog, Amplitude), implement
 * this function with that SDK and its server-side key, read from environment variables.
 */
export function forwardEvent(event: AnalyticsEvent): void {
  void event;
}
