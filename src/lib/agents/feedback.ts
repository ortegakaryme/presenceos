import type { AgentId } from "@/lib/domain/schemas";

export interface FeedbackDirectives {
  raw: string[];
  concise: boolean;
  warmer: boolean;
  moreFormal: boolean;
  seoFocus: boolean;
  /** Free-text terms the user asked to emphasise (matched against verified amenities later). */
  emphasis: string[];
  /** Components the latest feedback targets; empty = everything. */
  focus: ("copy" | "social" | "video" | "seo" | "visual" | "cta" | "brand" | "layout")[];
}

export const NO_FEEDBACK: FeedbackDirectives = {
  raw: [],
  concise: false,
  warmer: false,
  moreFormal: false,
  seoFocus: false,
  emphasis: [],
  focus: [],
};

const FOCUS_RULES: { focus: FeedbackDirectives["focus"][number]; re: RegExp }[] = [
  { focus: "copy", re: /\b(copy|headline|description|intro|listing|text|wording|story|narrative)\b/i },
  { focus: "social", re: /\b(social|instagram|linkedin|facebook|caption|post|email)\b/i },
  { focus: "video", re: /\b(video|reel|script|scene)\b/i },
  { focus: "seo", re: /\b(seo|search|meta|keyword|google)\b/i },
  { focus: "visual", re: /\b(image|photo|gallery|visual|picture|hero image)\b/i },
  { focus: "cta", re: /\b(cta|call to action|button|inquiry|contact|viewing)\b/i },
  { focus: "brand", re: /\b(brand|voice|tone|guardrail)\b/i },
  { focus: "layout", re: /\b(layout|order|section|structure|page flow)\b/i },
];

/**
 * Interprets free-text feedback into directives. Latest feedback decides the focus;
 * style preferences (concise, warmer…) accumulate across iterations unless contradicted.
 */
export function interpretFeedback(history: string[]): FeedbackDirectives {
  if (history.length === 0) return NO_FEEDBACK;
  const d: FeedbackDirectives = { ...NO_FEEDBACK, raw: history, emphasis: [], focus: [] };
  for (const text of history) {
    if (/\b(concise|shorter|tighter|brief|trim|less wordy|too long)\b/i.test(text)) d.concise = true;
    if (/\b(longer|more detail|expand)\b/i.test(text)) d.concise = false;
    if (/\b(warmer|friendlier|less formal|more inviting|softer)\b/i.test(text)) { d.warmer = true; d.moreFormal = false; }
    if (/\b(more formal|more polished|less casual)\b/i.test(text)) { d.moreFormal = true; d.warmer = false; }
    if (/\b(seo|search|keyword)\b/i.test(text)) d.seoFocus = true;
    for (const m of text.matchAll(/\b(?:emphasi[sz]e|highlight|feature|focus on|more about|lead with)\s+(?:the\s+)?([a-z][a-z' -]{2,40})/gi)) {
      d.emphasis.push(m[1].trim().replace(/[.,;].*$/, ""));
    }
  }
  const latest = history[history.length - 1];
  d.focus = FOCUS_RULES.filter((r) => r.re.test(latest)).map((r) => r.focus);
  return d;
}

/** Which specialists the Builder reruns for the given feedback (downstream closure added by the scheduler). */
export function agentsForFeedback(d: FeedbackDirectives): AgentId[] {
  if (d.focus.length === 0) return ["brand", "positioning", "copy", "visual", "social", "ux", "seo"];
  const set = new Set<AgentId>();
  for (const f of d.focus) {
    if (f === "copy") set.add("copy");
    if (f === "social" || f === "video") set.add("social");
    if (f === "seo") set.add("seo");
    if (f === "visual") set.add("visual");
    if (f === "cta") { set.add("brand"); set.add("seo"); }
    if (f === "brand") set.add("brand");
    if (f === "layout") set.add("ux");
  }
  if (d.concise || d.warmer || d.moreFormal) set.add("copy");
  return [...set];
}
