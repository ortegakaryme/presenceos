import type { PropertyBriefInput } from "@/lib/domain/schemas";

/**
 * Rule-based extraction of a structured brief from a pasted listing (Spanish or English).
 * No model call: it is fast, predictable and runs in the browser. Everything it extracts is
 * shown to the user for review before submission.
 */

export interface ParseResult {
  brief: Partial<PropertyBriefInput>;
  /** Human-readable labels of the fields that were filled. */
  filled: string[];
  /** Things the user should double-check. */
  notes: string[];
  setting: "forest" | "beach" | "city";
  isSpanish: boolean;
}

const WORD_NUM: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM = String.raw`\b(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|one|two|three|four|five|six|seven|eight|nine|ten)\b`;

function toInt(s: string): number {
  const w = WORD_NUM[s.toLowerCase()];
  return w ?? Number(s);
}

/** "38,500,000" → 38500000 · "38.5" + "millones" → 38500000 · "1.850" (es thousands) → 1850 */
function toAmount(raw: string, millions?: string): number {
  let s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return millions ? n * 1_000_000 : n;
}

/** Ordered longest-first: Spanish real-estate phrases → English. */
const GLOSSARY: [RegExp, string][] = [
  [/seguridad y acceso controlado en el desarrollo/gi, "Security and controlled access within the development"],
  [/acceso controlado/gi, "controlled access"],
  [/alberca climatizada/gi, "heated pool"],
  [/alberca infinita/gi, "infinity pool"],
  [/alberca/gi, "pool"],
  [/piscina/gi, "pool"],
  [/terraza cubierta/gi, "covered terrace"],
  [/terraza privada/gi, "private terrace"],
  [/terrazas/gi, "terraces"],
  [/terraza/gi, "terrace"],
  [/jard[ií]n arbolado/gi, "wooded garden"],
  [/jard[ií]n/gi, "garden"],
  [/estudio independiente/gi, "separate study"],
  [/estudio/gi, "study"],
  [/sala de televisi[oó]n|sala de tv/gi, "TV room"],
  [/cuarto de servicio/gi, "staff room"],
  [/[aá]rea de lavado/gi, "laundry area"],
  [/vista al mar|vistas al mar/gi, "ocean views"],
  [/vista a la bah[ií]a|vistas a la bah[ií]a/gi, "bay views"],
  [/vista al lago|vistas al lago/gi, "lake views"],
  [/cocina integral/gi, "fitted kitchen"],
  [/rec[aá]mara principal/gi, "primary suite"],
  [/vestidor/gi, "walk-in closet"],
  [/chimenea/gi, "fireplace"],
  [/gimnasio/gi, "gym"],
  [/elevador/gi, "elevator"],
  [/bodega/gi, "storage room"],
  [/acceso a la playa/gi, "beach access"],
  [/muelle/gi, "dock"],
  [/asador/gi, "grill"],
  [/palapa/gi, "palapa"],
  [/seguridad/gi, "security"],
  [/\by\b/gi, "and"],
  [/\bcon\b/gi, "with"],
  [/\ben el\b/gi, "in the"],
];

export function translateAmenity(s: string): string {
  let out = s;
  for (const [re, en] of GLOSSARY) out = out.replace(re, en);
  out = out.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Amenities mentioned in the description prose (both languages). */
const PROSE_AMENITIES: [RegExp, string][] = [
  [/doble altura|double[- ]height/i, "Double-height living room"],
  [/cocina[^.]*isla|kitchen[^.]*island/i, "Open kitchen with central island"],
  [/rec[aá]mara principal[^.]*terraza privada|primary (suite|bedroom)[^.]*private terrace/i, "Primary suite with private terrace"],
  [/vestidor|walk-in closet/i, "Walk-in closet in the primary suite"],
  [/sala de televisi[oó]n|tv room|media room/i, "TV room"],
  [/cuarto de servicio|staff (room|quarters)/i, "Staff room"],
  [/[aá]rea de lavado|laundry/i, "Laundry area"],
  [/chimenea|fireplace/i, "Fireplace"],
  [/jacuzzi/i, "Jacuzzi"],
];

const LABELS: Record<string, string> = {
  name: "Property name", location: "Location", price: "Price", landArea: "Land area", interiorArea: "Interior area",
  bedrooms: "Bedrooms", bathrooms: "Bathrooms", parkingSpaces: "Parking", yearBuilt: "Year built", amenities: "Amenities",
  description: "Description", propertyType: "Property type",
};

const NUMERIC_BULLET = /precio|price|terreno|land|construcci[oó]n|interior|superficie|rec[aá]maras|habitaciones|bedrooms?|ba[ñn]os|bath|estacionamiento|parking|cajones|año|year/i;

export function parseListing(text: string): ParseResult {
  const clean = text.replace(/\r/g, "");
  const rawLines = clean.split("\n");
  const strip = (l: string) => l.replace(/^#+\s*/, "").replace(/\*\*|__/g, "").replace(/^\*(.*)\*$/, "$1").trim();
  const lines = rawLines.map(strip);
  const nonEmpty = lines.filter(Boolean);
  const lower = clean.toLowerCase();
  const isSpanish = /\b(rec[aá]maras|ba[ñn]os|terreno|alberca|ubicad[ao]|propiedad|cuenta con)\b/i.test(clean);
  const brief: Partial<PropertyBriefInput> = {};
  const filled = new Set<string>();
  const notes: string[] = [];

  // Name: first heading, else first line.
  const heading = rawLines.find((l) => /^#\s+/.test(l));
  const name = strip(heading ?? nonEmpty[0] ?? "");
  if (name && name.length <= 60) {
    brief.name = name;
    filled.add("name");
  }

  // Subtitle with type and location: "Residencia contemporánea en Avándaro, Valle de Bravo".
  const subtitle = nonEmpty.find((l) => l !== name && /\b(en|in)\s+[A-ZÁÉÍÓÚ]/.test(l) && l.length < 120);
  const locMatch = subtitle ? /\b(?:en|in)\s+(.+)$/.exec(subtitle) : null;
  if (locMatch) {
    const parts = locMatch[1].split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      brief.neighborhood = parts[0];
      brief.city = parts.slice(1).join(", ");
    } else {
      brief.city = parts[0];
    }
    filled.add("location");
  }
  const typeSource = `${subtitle ?? ""} ${name}`.toLowerCase();
  brief.propertyType = /penthouse|ph\b/.test(typeSource) ? "penthouse" : /villa/.test(typeSource) ? "villa" : /departamento|apartment|condo/.test(typeSource) ? "apartment" : /hacienda|estate|rancho/.test(typeSource) ? "estate" : "house";
  if (/mexico|méxico|cdmx|jalisco|guerrero|quintana roo|valle de bravo|vallarta|acapulco|canc[uú]n|tulum|los cabos/i.test(clean)) brief.country = "Mexico";

  // Price.
  const priceLine = lines.find((l) => /precio|price|asking/i.test(l)) ?? clean;
  const pm = /(?:US\$|\$|USD|MXN|EUR|€)?\s*(\d[\d.,]*)\s*(millones|million|mdp|m\b)?\s*(MXN|USD|EUR|d[oó]lares|pesos|mdp)?/i.exec(priceLine.replace(/^[^\d$€]*/, ""));
  if (pm) {
    const amount = toAmount(pm[1], pm[2]);
    if (amount > 10000) {
      const cur = `${priceLine}`.match(/USD|US\$|d[oó]lares/i) ? "USD" : priceLine.match(/EUR|€/i) ? "EUR" : "MXN";
      brief.price = { amount, currency: cur };
      filled.add("price");
    }
  }

  const findNum = (re: RegExp) => {
    for (const l of lines) {
      const m = re.exec(l);
      if (m) return m;
    }
    return re.exec(clean);
  };
  const land = findNum(/(?:terreno|land(?: area)?|lot(?: size)?)[^\d\n]{0,25}(\d[\d.,]*)\s*m/i);
  if (land) { brief.landArea = toAmount(land[1]); filled.add("landArea"); }
  const interior = findNum(/(?:construcci[oó]n|interior|built area|living area|superficie construida)[^\d\n]{0,25}(\d[\d.,]*)\s*m/i);
  if (interior) { brief.interiorArea = toAmount(interior[1]); filled.add("interiorArea"); }
  brief.areaUnit = /sq\.?\s?ft|square feet/i.test(clean) ? "sqft" : "m2";

  const beds = findNum(new RegExp(`(?:rec[aá]maras|habitaciones|bedrooms?)[^\\d\\n]{0,5}${NUM}`, "i")) ?? findNum(new RegExp(`${NUM}\\s+(?:rec[aá]maras|habitaciones|bedrooms?)`, "i"));
  if (beds) { brief.bedrooms = toInt(beds[1]); filled.add("bedrooms"); }

  let full: number | null = null;
  let half = 0;
  for (const l of lines) {
    const m = new RegExp(`${NUM}`, "i");
    if (/medios?\s+ba[ñn]os|half[- ]bath/i.test(l)) {
      const n = /(?:medios?\s+ba[ñn]os|half[- ]bath(?:room)?s?)[^\d\n]{0,5}(\d+)/i.exec(l) ?? /(\d+)\s+(?:medios?\s+ba[ñn]os|half)/i.exec(l);
      if (n) half = toInt(n[1]);
    } else if (/ba[ñn]os|bath/i.test(l) && m.test(l)) {
      const n = /(?:ba[ñn]os(?:\s+completos)?|(?:full\s+)?bath(?:room)?s?)[^\d\n]{0,5}(\d+(?:\.5)?)/i.exec(l) ?? /(\d+(?:\.5)?)\s+(?:ba[ñn]os|(?:full\s+)?bath)/i.exec(l);
      if (n && full == null) full = Number(n[1]);
    }
  }
  if (full != null) { brief.bathrooms = full + half * 0.5; filled.add("bathrooms"); }

  const park = findNum(new RegExp(`(?:estacionamiento|parking|cajones|garage)[^\\d\\n]{0,30}?${NUM}`, "i"));
  if (park) { brief.parkingSpaces = toInt(park[1]); filled.add("parkingSpaces"); }
  const year = findNum(/(?:construida en|construido en|built in|año de construcci[oó]n|year built)[^\d\n]{0,5}(\d{4})/i);
  if (year) { brief.yearBuilt = Number(year[1]); filled.add("yearBuilt"); }

  // Amenities: non-numeric bullets, plus features named in the prose.
  const bullets = rawLines.filter((l) => /^\s*[-•*]\s+/.test(l)).map((l) => strip(l.replace(/^\s*[-•*]\s+/, "")));
  const amenities: string[] = [];
  const add = (a: string) => {
    const key = a.toLowerCase();
    if (!amenities.some((x) => x.toLowerCase().includes(key.split(" ")[0]) && x.toLowerCase().includes(key.split(" ").slice(-1)[0]))) amenities.push(a);
  };
  for (const b of bullets) if (!NUMERIC_BULLET.test(b.split(":")[0])) add(isSpanish ? translateAmenity(b) : b);
  for (const [re, en] of PROSE_AMENITIES) if (re.test(clean) && !amenities.some((a) => a.toLowerCase().includes(en.toLowerCase().split(" ")[0]))) amenities.push(en);
  if (amenities.length) {
    brief.verifiedAmenities = amenities;
    filled.add("amenities");
    notes.push("Amenities were extracted from the text and listed as verified. Move anything that is not documented to “Claims to verify”.");
  }

  // Description: prose paragraphs (not headings, bullets, section titles or disclaimers).
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#/.test(p) && !/^\s*[-•*]\s/.test(p) && !/\n\s*[-•*]\s/.test(p) && !/^\*\*[^*]+\*\*$/.test(p) && !/^\*[^*].*\*$/.test(p) && !/ficticio|fictional/i.test(p) && p.length > 60)
    .map((p) => p.replace(/\*\*/g, ""));
  if (paragraphs.length) {
    brief.description = paragraphs.join("\n\n");
    filled.add("description");
  }

  if (brief.neighborhood || brief.city) {
    brief.locationNotes = `Located in ${[brief.neighborhood, brief.city].filter(Boolean).join(", ")}.`;
    if (/cercan[ií]a|minutos|near|minutes|close to/i.test(clean)) notes.push("Proximity statements (restaurants, clubs, golf…) stay in the description as unverified context; add them to Location notes only if you can stand behind them.");
  }
  brief.isFictional = /fictici|fictional|fictitious/i.test(clean) || undefined;
  if (isSpanish) notes.push("The listing is in Spanish. Amenities were translated to English for the English campaign; demo agents write in English (Spanish output requires model mode).");

  const setting = /bosque|forest|pinos|pine|woodland|monta[ñn]a|lago|lake|valle de bravo/i.test(lower) ? "forest" : /playa|beach|mar\b|ocean|oc[eé]ano|bah[ií]a|bay|caribe|caribbean|pac[ií]fico|vallarta|acapulco|canc[uú]n|tulum/i.test(lower) ? "beach" : "city";

  return { brief, filled: [...filled].map((k) => LABELS[k] ?? k), notes, setting, isSpanish };
}
