import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { criterion, keyFacts } from "../helpers";
import type { CopyOutput } from "./copy";
import type { VisualOutput } from "./visual";
import type { BrandOutput } from "./brand";
import { ChannelSchema, VideoSceneSchema } from "@/lib/domain/schemas";
import { slugify } from "@/lib/format";

const Input = z.object({
  name: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  channels: z.array(ChannelSchema),
  headline: z.string(),
  subheadline: z.string(),
  features: z.array(z.string()),
  shots: z.array(z.object({ imageId: z.string(), note: z.string() })),
  ctaLabel: z.string(),
  agentName: z.string(),
  facts: z.object({ bedrooms: z.string(), interior: z.string(), price: z.string() }),
  concise: z.boolean(),
});
const Output = z.object({
  ...baseOutputShape,
  posts: z.array(z.object({ channel: ChannelSchema, text: z.string() })),
  reelDurationSec: z.number(),
  scenes: z.array(VideoSceneSchema),
});
export type SocialOutput = z.infer<typeof Output>;

const tag = (s: string) => "#" + slugify(s).split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

export const socialAgent: AgentDefinition<z.infer<typeof Input>, SocialOutput> = {
  id: "social",
  number: "08",
  name: "Social & Video Producer",
  purpose: "Creates platform-specific social captions, variants and a short property reel script.",
  dependsOn: ["copy", "visual", "brand"],
  kind: "llm",
  acceptanceCriteria: [
    "One post for every selected channel",
    "Reel is 60 seconds or shorter with at least four scenes",
    "Every scene has a shot, voiceover and on-screen text",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: (ctx) => `Writing ${ctx.brief.channels.length} channel posts and a reel script`,
  buildInput: (ctx) => {
    const copy = upstream<CopyOutput>(ctx, "copy");
    const visual = upstream<VisualOutput>(ctx, "visual");
    const brand = upstream<BrandOutput>(ctx, "brand");
    const f = keyFacts(ctx.brief);
    return {
      name: ctx.brief.name,
      neighborhood: ctx.brief.neighborhood,
      city: ctx.brief.city,
      channels: ctx.brief.channels,
      headline: copy.heroHeadline,
      subheadline: copy.heroSubheadline,
      features: copy.features.map((x) => x.title),
      shots: visual.shotNotes.map((s) => ({ imageId: s.imageId, note: s.note })),
      ctaLabel: brand.ctaLabel,
      agentName: ctx.brief.agentName,
      facts: { bedrooms: f.bedrooms, interior: f.interior, price: f.price },
      concise: ctx.feedback.concise,
    };
  },
  demo: (input) => {
    const tags = [tag(input.neighborhood), tag(input.city), "#ArchitecturalHomes", "#LuxuryRealEstate"].join(" ");
    const bullets = input.features.slice(0, input.concise ? 3 : 4).map((f) => `— ${f}`).join("\n");
    const texts: Record<string, string> = {
      instagram: `${input.headline}\n\n${input.subheadline}\n\n${bullets}\n\n${input.ctaLabel} — link in bio.\n\n${tags}`,
      linkedin: `New to the market: ${input.name}, ${input.neighborhood}.\n\n${input.subheadline} Offered at ${input.facts.price}.\n\nKey features: ${input.features.slice(0, 4).join(", ").toLowerCase()}.\n\n${input.ctaLabel} with ${input.agentName}.`,
      facebook: `${input.name} · ${input.neighborhood}, ${input.city}\n\n${input.subheadline}\n\n${input.ctaLabel}.`,
      email: `Subject: ${input.name} — ${input.neighborhood}\n\n${input.headline}.\n\n${input.subheadline} Offered at ${input.facts.price}.\n\n${bullets}\n\n${input.ctaLabel} with ${input.agentName}.`,
    };
    const shots = input.shots.length ? input.shots : [{ imageId: "", note: "Exterior" }];
    const per = input.concise ? 5 : 6;
    const sceneShots = shots.slice(0, 4);
    const scenes = [
      ...sceneShots.map((s, i) => ({
        timecode: `0:${String(i * per).padStart(2, "0")}–0:${String((i + 1) * per).padStart(2, "0")}`,
        shot: `${s.note} — slow push-in${s.imageId ? ` (photo ${s.imageId})` : ""}`,
        voiceover: i === 0 ? input.headline + "." : i === 1 ? input.subheadline : `${input.features[i] ?? input.features[0]}.`,
        onScreen: i === 0 ? input.name : i === 1 ? `${input.facts.bedrooms} · ${input.facts.interior}` : input.features[i] ?? "",
      })),
      {
        timecode: `0:${String(sceneShots.length * per).padStart(2, "0")}–0:${String(sceneShots.length * per + per).padStart(2, "0")}`,
        shot: "Title card on ivory",
        voiceover: `${input.ctaLabel}.`,
        onScreen: `${input.ctaLabel} · ${input.agentName}`,
      },
    ];
    const posts = input.channels.map((c) => ({ channel: c, text: texts[c] }));
    return {
      summary: `${posts.length} posts (${input.channels.join(", ")}) and a ${scenes.length * per}-second reel in ${scenes.length} scenes.`,
      rationale: "Posts reuse the approved-candidate headline, subheadline and feature titles so every channel says the same verified things; the reel follows the Visual Director's sequence.",
      warnings: ["Reel script uses still photography with camera moves; no video footage was supplied."],
      assumptions: [],
      posts,
      reelDurationSec: scenes.length * per,
      scenes,
    };
  },
  instructions: `You are Agent 08, Social and Video Producer.
Write one post per selected channel, adapted to that platform's conventions, and a property reel script (max 60 seconds) as scenes with timecode, shot (reference supplied photo ids), voiceover and on-screen text.
Use only the supplied headline, facts and features. No hype, no urgency.
${SHARED_RULES}`,
  accept: (o, i) => [
    criterion("One post for every selected channel", i.channels.every((c) => o.posts.some((p) => p.channel === c && p.text.trim().length > 0))),
    criterion("Reel is 60 seconds or shorter with at least four scenes", o.reelDurationSec <= 60 && o.scenes.length >= 4, `${o.reelDurationSec}s · ${o.scenes.length} scenes`),
    criterion("Every scene has a shot, voiceover and on-screen text", o.scenes.every((s) => s.shot && s.voiceover && s.onScreen)),
  ],
  proposals: (o) => [
    ...o.posts.map((p) => ({
      field: `social.${p.channel}` as const,
      value: p.text,
      rationale: `${p.channel === "linkedin" ? "Professional framing with price and agent" : p.channel === "email" ? "Announcement format with subject line" : "Visual-first caption with restrained hashtags"}; reuses verified copy.`,
      evidence: ["Agent 06 · headline & features"],
    })),
    { field: "video.scenes", value: o.scenes, rationale: `${o.reelDurationSec}-second reel following the photo sequence from Agent 07.`, evidence: ["Agent 07 · shot notes"] },
  ],
  summarize: (o) => o.summary,
};
