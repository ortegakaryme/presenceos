import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Property brief (Phase 1 — intake)                                   */
/* ------------------------------------------------------------------ */

export const CHANNELS = ["instagram", "linkedin", "facebook", "email"] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

export const CURRENCIES = ["MXN", "USD", "EUR"] as const;
export const PROPERTY_TYPES = ["house", "villa", "penthouse", "apartment", "estate"] as const;

export const ImageAssetSchema = z.object({
  id: z.string().min(1),
  url: z
    .string()
    .min(1)
    .refine((u) => /^https:\/\/\S+$/.test(u) || u.startsWith("/api/uploads/"), "Must be an https:// URL or an uploaded file"),
  caption: z.string().trim().min(1, "Add a short caption describing what the photo shows"),
  source: z.enum(["url", "upload"]).default("url"),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

const nonEmpty = (label: string) => z.string().trim().min(1, `${label} is required`);

export const PropertyBriefSchema = z.object({
  name: nonEmpty("Property name"),
  propertyType: z.enum(PROPERTY_TYPES).default("house"),
  neighborhood: nonEmpty("Neighborhood"),
  city: nonEmpty("City"),
  country: nonEmpty("Country"),
  price: z.object({
    amount: z.number({ message: "Price is required" }).positive("Price must be greater than zero"),
    currency: z.enum(CURRENCIES),
  }),
  bedrooms: z.number({ message: "Bedrooms is required" }).int().min(0).max(40),
  bathrooms: z
    .number({ message: "Bathrooms is required" })
    .min(0)
    .max(40)
    .refine((n) => Number.isInteger(n * 2), "Use whole or half bathrooms (e.g. 4.5)"),
  interiorArea: z.number({ message: "Interior area is required" }).positive(),
  landArea: z.number().positive().nullable().default(null),
  areaUnit: z.enum(["m2", "sqft"]),
  yearBuilt: z.number().int().min(1500).max(2100).nullable().default(null),
  parkingSpaces: z.number().int().min(0).max(50).nullable().default(null),
  maintenanceFee: z.number().min(0).nullable().default(null),
  verifiedAmenities: z.array(z.string().trim().min(1)).min(1, "List at least one verified amenity"),
  claimsToVerify: z.array(z.string().trim().min(1)).default([]),
  description: nonEmpty("Property description"),
  locationNotes: z.string().trim().default(""),
  targetBuyer: nonEmpty("Target buyer segment"),
  language: z.enum(["en", "es"]),
  brandVoice: nonEmpty("Brand voice"),
  tone: z.array(z.string().trim().min(1)).min(1, "Choose at least one tone word"),
  channels: z.array(ChannelSchema).min(1, "Choose at least one channel"),
  images: z.array(ImageAssetSchema).min(1, "Add at least one property photo"),
  agentName: nonEmpty("Listing agent name"),
  brokerage: nonEmpty("Brokerage name"),
  contactEmail: z.string().trim().email("Enter a valid email address"),
  contactPhone: z.string().trim().default(""),
  isFictional: z.boolean().default(true),
});
export type PropertyBrief = z.infer<typeof PropertyBriefSchema>;
export type PropertyBriefInput = z.input<typeof PropertyBriefSchema>;

/* ------------------------------------------------------------------ */
/* Campaign content (the artefact the Builder maintains)               */
/* ------------------------------------------------------------------ */

export const SECTION_KEYS = ["facts", "story", "gallery", "features", "amenities", "location", "inquiry"] as const;
export const SectionKeySchema = z.enum(SECTION_KEYS);
export type SectionKey = z.infer<typeof SectionKeySchema>;

export const FeatureSchema = z.object({ title: z.string(), body: z.string() });
export type Feature = z.infer<typeof FeatureSchema>;

export const VideoSceneSchema = z.object({
  timecode: z.string(),
  shot: z.string(),
  voiceover: z.string(),
  onScreen: z.string(),
});
export type VideoScene = z.infer<typeof VideoSceneSchema>;

export const CampaignContentSchema = z.object({
  positioning: z.object({ statement: z.string() }),
  brand: z.object({ voice: z.string(), guardrails: z.array(z.string()) }),
  landing: z.object({
    heroHeadline: z.string(),
    heroSubheadline: z.string(),
    intro: z.string(),
    description: z.array(z.string()),
    features: z.array(FeatureSchema),
    locationCopy: z.string(),
    ctaLabel: z.string(),
    ctaSupport: z.string(),
    sectionOrder: z.array(SectionKeySchema),
    heroImageId: z.string(),
    galleryImageIds: z.array(z.string()),
  }),
  listing: z.object({ headlines: z.array(z.string()), copy: z.string() }),
  social: z.object({
    instagram: z.string(),
    linkedin: z.string(),
    facebook: z.string(),
    email: z.string(),
  }),
  video: z.object({ scenes: z.array(VideoSceneSchema) }),
  seo: z.object({ metaTitle: z.string(), metaDescription: z.string(), slug: z.string() }),
});
export type CampaignContent = z.infer<typeof CampaignContentSchema>;

/* ------------------------------------------------------------------ */
/* Agents, proposals, conflicts                                        */
/* ------------------------------------------------------------------ */

export const AGENT_IDS = [
  "audience",
  "market",
  "facts",
  "brand",
  "positioning",
  "copy",
  "visual",
  "social",
  "ux",
  "seo",
  "qa",
  "analytics",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];
export type Author = AgentId | "human" | "builder";

export type FieldValue = string | string[] | Feature[] | VideoScene[];

export type IssueSeverity = "info" | "warning" | "critical";

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  evidence?: string;
}

export type ProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "superseded" // another option in the same conflict was approved
  | "applied"
  | "auto_rejected" // Builder rejected it (invalid value / no-op) — kept for traceability
  | "stale"; // left undecided when a newer iteration started

export interface Proposal {
  id: string;
  runId: string;
  iteration: number;
  agentId: Author;
  field: string;
  currentValue: FieldValue | null;
  proposedValue: FieldValue;
  editedValue?: FieldValue;
  rationale: string;
  evidence: string[];
  validation: { status: "passed" | "warning" | "blocked"; issues: ValidationIssue[] };
  risk: "low" | "medium" | "high" | "critical";
  status: ProposalStatus;
  conflictId?: string;
  correctsProposalId?: string;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  /** "seed" = pre-approved by the example-campaign seed script, not by a person. */
  decidedBy?: "human" | "seed";
  appliedInVersion?: number;
}

export interface Conflict {
  id: string;
  runId: string;
  field: string;
  proposalIds: string[];
  tradeoff: string;
  recommendation: { proposalId: string; reason: string };
  status: "open" | "resolved";
  resolvedProposalId?: string;
}

export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "skipped" | "reused";

export interface AcceptanceResult {
  criterion: string;
  passed: boolean;
  detail?: string;
}

export interface AgentRunRecord {
  agentId: AgentId;
  status: AgentRunStatus;
  task: string;
  executionMode: "demo" | "model" | "rule";
  model?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  attempts: number;
  summary?: string;
  rationale?: string;
  warnings: string[];
  errors: string[];
  acceptance: AcceptanceResult[];
  output?: unknown;
  proposalIds: string[];
  reusedFromRunId?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface Run {
  id: string;
  iteration: number;
  status: "running" | "completed" | "completed_with_errors";
  startedAt: string;
  completedAt?: string;
  feedback?: string;
  plannedAgents: AgentId[];
  injectFailure: boolean;
  mode: "demo" | "model";
  agents: Record<AgentId, AgentRunRecord>;
  synthesis?: {
    proposalsCreated: number;
    autoRejected: number;
    noOpDiscarded: number;
    conflicts: number;
    blocked: number;
  };
}

/* ------------------------------------------------------------------ */
/* Versions, changelog, QA                                             */
/* ------------------------------------------------------------------ */

export interface Version {
  number: number;
  createdAt: string;
  label: string;
  source: "baseline" | "apply" | "restore";
  content: CampaignContent;
  appliedChangeIds: string[];
  restoredFrom?: number;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  version: number;
  changeId?: string;
  author: Author;
  field: string;
  oldValue: FieldValue | null;
  newValue: FieldValue;
  rationale: string;
  approval: "baseline" | "approved" | "approved_with_edits" | "restored" | "example_seed";
}

export type QACategory =
  | "factual"
  | "unsupported_claim"
  | "missing_content"
  | "brand"
  | "compliance"
  | "link"
  | "rendering"
  | "length";

export interface QAIssue {
  id: string;
  category: QACategory;
  severity: IssueSeverity;
  field?: string;
  message: string;
  evidence: string;
  suggestion: string;
}

export interface QACheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface QAReport {
  ranAt: string;
  version: number;
  issues: QAIssue[];
  checks: QACheck[];
  regression: QACheck[];
}

export interface Fact {
  id: string;
  label: string;
  value: string;
  status: "verified" | "user_provided" | "assumption" | "missing";
  source: string;
}

export interface Campaign {
  id: string;
  /** "example" campaigns are preloaded demos and are excluded from workflow metrics. */
  origin?: "user" | "example";
  createdAt: string;
  updatedAt: string;
  brief: PropertyBrief;
  currentVersion: number;
  versions: Version[];
  proposals: Proposal[];
  conflicts: Conflict[];
  runs: Run[];
  changelog: ChangeLogEntry[];
  qa: QAReport | null;
  feedbackHistory: { iteration: number; text: string; at: string }[];
  approval: { version: number; at: string } | null;
}
