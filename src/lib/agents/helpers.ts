import type { AcceptanceResult, PropertyBrief } from "@/lib/domain/schemas";
import { formatArea, formatPrice, numberWord } from "@/lib/format";

export function pick<T>(options: T[], iteration: number): T {
  return options[(iteration - 1) % options.length];
}

export function criterion(criterion: string, passed: boolean, detail?: string): AcceptanceResult {
  return { criterion, passed, detail };
}

/** Matches emphasis terms from feedback to verified amenities. */
export function emphasisedAmenities(brief: PropertyBrief, emphasis: string[]): string[] {
  const out: string[] = [];
  for (const term of emphasis) {
    const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    // Best match = amenity containing the most of the requested words.
    let best: { a: string; score: number } | null = null;
    for (const a of brief.verifiedAmenities) {
      const score = words.filter((w) => a.toLowerCase().includes(w)).length;
      if (score > 0 && (!best || score > best.score)) best = { a, score };
    }
    if (best && !out.includes(best.a)) out.push(best.a);
  }
  return out;
}

/** Orders amenities with emphasised ones first. */
export function orderedAmenities(brief: PropertyBrief, emphasis: string[]): string[] {
  const first = emphasisedAmenities(brief, emphasis);
  return [...first, ...brief.verifiedAmenities.filter((a) => !first.includes(a))];
}

export function keyFacts(brief: PropertyBrief) {
  return {
    price: formatPrice(brief.price.amount, brief.price.currency),
    bedrooms: `${numberWord(brief.bedrooms)} bedrooms`,
    bathrooms: `${brief.bathrooms} bathrooms`,
    interior: formatArea(brief.interiorArea, brief.areaUnit),
    land: brief.landArea ? formatArea(brief.landArea, brief.areaUnit) : null,
    place: `${brief.neighborhood}, ${brief.city}`,
  };
}

/** A short noun phrase for an amenity, e.g. "Private garden with mature jacaranda trees" → "private garden". */
export function amenityNoun(amenity: string): string {
  const head = amenity.split(/\s+(?:with|and|for|completed|facing|from|under|on|across)\s+/i)[0];
  // Lower-case the first word only, so proper nouns ("Banderas Bay") keep their capitals.
  return head.charAt(0).toLowerCase() + head.slice(1);
}

/** Physical rooms/spaces, as opposed to views, services, systems or renovation notes. */
export function isSpace(amenity: string): boolean {
  return !/^(unobstructed |panoramic )?views?\b|^panoramic|^ocean views|^security|^24-hour|^backup|^structural|^full |renovat|^solar|^two parking|^covered parking|^parking|^private elevator|^residents'/i.test(amenity);
}

/** Verified amenities that read as spaces, in the given order (falls back to all if too few). */
export function spaces(amenities: string[]): string[] {
  const s = amenities.filter(isSpace);
  return s.length >= 3 ? s : [...s, ...amenities.filter((a) => !s.includes(a))];
}

export function firstSentences(text: string, n: number): string {
  const s = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return s.slice(0, n).join("").trim();
}

const TYPE_TITLE: Record<PropertyBrief["propertyType"], string> = { house: "House", villa: "Villa", penthouse: "Penthouse", apartment: "Residence", estate: "Estate" };
export function typeTitle(brief: Pick<PropertyBrief, "propertyType">): string {
  return TYPE_TITLE[brief.propertyType ?? "house"];
}

/**
 * The property's signature setting, derived only from verified amenities and location notes,
 * e.g. { adj: "Ocean-View", noun: "Ocean" }. Used for headlines.
 */
export function signatureFeature(amenities: string[]): { adj: string; noun: string } {
  const text = amenities.join(" \n ").toLowerCase();
  const rules: [RegExp, string, string][] = [
    [/\bocean\b/, "Ocean-View", "Ocean"],
    [/\bsea\b/, "Sea-View", "Sea"],
    [/\bbay\b/, "Bay-View", "Bay"],
    [/lagoon/, "Lagoon-View", "Lagoon"],
    [/\bforest\b/, "Forest", "Forest"],
    [/wooded|woodland/, "Woodland", "Woodland"],
    [/garden/, "Garden", "Garden"],
  ];
  for (const [re, adj, noun] of rules) if (re.test(text)) return { adj, noun };
  const n = amenityNoun(amenities[0] ?? "Architecture").replace(/^private\s+/i, "").replace(/^[\w]+-[\w]+\s+/, "");
  const t = n.replace(/\b\w/g, (c) => c.toUpperCase());
  return { adj: t, noun: t };
}
