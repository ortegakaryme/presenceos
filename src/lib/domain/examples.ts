import type { ImageAsset, PropertyBriefInput } from "./schemas";
import { SAMPLE_BRIEF } from "./sample";
import { parseListing } from "@/lib/intake/parse";

/**
 * Example campaigns preloaded into a new workspace. Every property, name, address detail, agent and
 * brokerage is fictional, created only for this product demo. Photos are illustrative stock imagery;
 * captions describe what each photo actually shows.
 */

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=2000&q=80`;
const photo = (id: string, unsplashId: string, caption: string): ImageAsset => ({ id, url: img(unsplashId), caption, source: "url" });

/** Illustrative stock sets the intake can attach when a brief has no photos yet. */
export const STOCK_PHOTOS: Record<"forest" | "beach" | "city", ImageAsset[]> = {
  forest: [
    photo("img-forest-facade", "1600566753190-17f0baa2a6c3", "Contemporary timber and glass façade among trees"),
    photo("img-forest-living", "1564078516393-cf04bd966897", "Double-height living room with tall windows"),
    photo("img-forest-dining", "1604014237800-1c9102c219da", "Living and dining area opening to a covered terrace"),
    photo("img-forest-kitchen", "1600585152220-90363fe7e115", "Open kitchen with central island"),
    photo("img-forest-pool", "1576013551627-0cc20b96c2a7", "Pool set in a planted garden"),
    photo("img-forest-bedroom", "1600607687644-c7171b42498f", "Bedroom with glass doors to the garden"),
    photo("img-forest-bath", "1584622650111-993a426fbf0a", "Bathroom with walk-in shower"),
    photo("img-forest-setting", "1595521624992-48a59aef95e3", "Timber cabin among tall trees in the wider forest setting"),
  ],
  beach: [
    photo("img-beach-coast", "1615571022219-eb45cf7faa9d", "Modern villa above the shoreline"),
    photo("img-beach-pool", "1582268611958-ebfd161ef9cf", "Pool terrace and open living pavilion"),
    photo("img-beach-deck", "1512917774080-9991f1c4c750", "Pool deck with tropical planting"),
    photo("img-beach-living", "1600210491892-03d54c0aaf87", "Living room with arched windows"),
    photo("img-beach-kitchen", "1507089947368-19c1da9775ae", "Kitchen with island seating"),
    photo("img-beach-bedroom", "1618773928121-c32242e63f39", "Primary bedroom"),
    photo("img-beach-garden", "1602343168117-bb8ffe3e2e9f", "Villa and pool seen from the garden"),
  ],
  city: SAMPLE_BRIEF.images.filter((i) => i.id !== "img-terrace").map((i) => ({ ...i, source: "url" as const })),
};

export const CASA_UMBRAL_TEXT = `# Casa Umbral
**Residencia contemporánea en Avándaro, Valle de Bravo**

Enclavada entre los bosques de Avándaro, Casa Umbral es una residencia contemporánea concebida para quienes buscan desconectarse del ritmo de la ciudad sin renunciar al diseño, el confort y la privacidad.

La propiedad se desarrolla sobre un terreno de 1,850 m², con 620 m² de construcción distribuidos en dos niveles. Su arquitectura combina piedra natural, madera de roble, concreto aparente y amplios ventanales que integran el paisaje boscoso al interior de la casa.

La residencia cuenta con cinco recámaras, todas con baño privado, una amplia estancia de doble altura, comedor con vista al jardín y una cocina integral abierta con isla central. La recámara principal dispone de terraza privada, vestidor y baño con acabados en piedra natural.

En el exterior, una terraza cubierta funciona como extensión del área social y se conecta con un jardín arbolado, alberca climatizada y jacuzzi. La propiedad también cuenta con una sala de televisión, estudio independiente, cuarto de servicio, área de lavado y estacionamiento para cuatro vehículos.

Cada espacio fue pensado para aprovechar la luz natural y generar una conexión constante con el entorno. La combinación de materiales cálidos, vegetación y espacios abiertos crea una atmósfera de tranquilidad durante todo el año.

Ubicada en una zona residencial de Avándaro, la casa ofrece cercanía a restaurantes, clubes deportivos, campos de golf y comercios locales, además de fácil acceso a las principales atracciones de Valle de Bravo.

**Características principales**
- Precio de venta: $38,500,000 MXN
- Terreno: 1,850 m²
- Construcción: 620 m²
- Recámaras: 5
- Baños completos: 6
- Medios baños: 1
- Estacionamiento: 4 vehículos
- Alberca climatizada y jacuzzi
- Terraza cubierta y jardín arbolado
- Estudio independiente
- Seguridad y acceso controlado en el desarrollo

*Propiedad, nombre, ubicación específica y características completamente ficticios, creados exclusivamente para una demostración de producto.*`;

/** Defaults the intake applies to anything a pasted listing does not specify. */
export const INTAKE_DEFAULTS = {
  country: "Mexico",
  language: "en",
  brandVoice: "Quiet luxury — editorial, restrained, precise",
  tone: ["understated", "warm"],
  channels: ["instagram", "email"],
  agentName: "Demo Agent (fictional)",
  brokerage: "PresenceOS Demo Realty (fictional)",
  contactEmail: "agent@example.com",
  contactPhone: "+52 55 0000 0000",
  isFictional: true,
  claimsToVerify: [],
  targetBuyer: "Buyers seeking a design-led home with privacy and outdoor living.",
} satisfies Partial<PropertyBriefInput>;

/** Builds a brief from pasted text: parsed fields over defaults, plus a stock photo set if needed. */
export function briefFromListing(text: string, overrides: Partial<PropertyBriefInput> = {}): PropertyBriefInput {
  const r = parseListing(text);
  return { ...INTAKE_DEFAULTS, images: STOCK_PHOTOS[r.setting], ...r.brief, ...overrides } as PropertyBriefInput;
}

const UMBRAL: PropertyBriefInput = briefFromListing(CASA_UMBRAL_TEXT, {
  targetBuyer: "Families and executives from Mexico City seeking a weekend and year-round retreat with privacy, nature and design.",
  agentName: "Lucía Herrera (fictional)",
  brokerage: "Bosque Alto Propiedades (fictional)",
  contactEmail: "lucia.herrera@example.com",
  tone: ["understated", "warm", "natural"],
  channels: ["instagram", "facebook", "email"],
});

const MAREA: PropertyBriefInput = {
  name: "Villa Marea",
  propertyType: "villa",
  neighborhood: "Conchas Chinas",
  city: "Puerto Vallarta",
  country: "Mexico",
  price: { amount: 3_950_000, currency: "USD" },
  bedrooms: 4,
  bathrooms: 4.5,
  interiorArea: 540,
  landArea: 900,
  areaUnit: "m2",
  yearBuilt: 2019,
  parkingSpaces: 3,
  maintenanceFee: null,
  verifiedAmenities: [
    "Infinity pool facing Banderas Bay",
    "Ocean views from the main living areas and every bedroom",
    "Open-air living pavilion with retractable glass walls",
    "Chef's kitchen with island seating",
    "Primary suite with private terrace",
    "Outdoor dining terrace with built-in grill",
    "Tropical garden with mature palms",
    "Staff room with separate entrance",
  ],
  claimsToVerify: ["Private beach access via a shared stairway (HOA to confirm)"],
  description:
    "Enjoy the best sunsets in Puerto Vallarta from this one-of-a-kind villa above Conchas Chinas. Every room opens to the Pacific, and the infinity pool seems to pour into the bay. A smart investment that will only appreciate.",
  locationNotes: "Set on the hillside of Conchas Chinas, south of downtown Puerto Vallarta, Jalisco. The listing agent notes the drive to the Zona Romántica takes about 5 minutes.",
  targetBuyer: "North American and Mexico City buyers seeking a second home with ocean views, privacy and space to host.",
  language: "en",
  brandVoice: "Relaxed coastal luxury — sunlit, precise, unhurried",
  tone: ["warm", "luminous", "unhurried"],
  channels: ["instagram", "linkedin", "email"],
  images: STOCK_PHOTOS.beach,
  agentName: "Andrés Robles (fictional)",
  brokerage: "Costa Pacífico Realty (fictional)",
  contactEmail: "andres.robles@example.com",
  contactPhone: "+52 322 000 0000",
  isFictional: true,
};

const BRISA: PropertyBriefInput = {
  name: "Casa Brisa",
  propertyType: "house",
  neighborhood: "Las Brisas",
  city: "Acapulco",
  country: "Mexico",
  price: { amount: 42_000_000, currency: "MXN" },
  bedrooms: 6,
  bathrooms: 6.5,
  interiorArea: 780,
  landArea: 1200,
  areaUnit: "m2",
  yearBuilt: 1996,
  parkingSpaces: 4,
  maintenanceFee: 18_000,
  verifiedAmenities: [
    "Panoramic views of Acapulco Bay",
    "Pool and sun deck on the main terrace",
    "Terraced design across three levels",
    "Outdoor living room under a palapa roof",
    "Primary suite with bay-view terrace",
    "Guest suite with independent entrance",
    "Structural review and full renovation completed in 2024",
    "Backup power generator",
  ],
  claimsToVerify: ["Membership access to a private beach club (seller to confirm)"],
  description:
    "Casa Brisa sits in the safest neighborhood in Acapulco, with legendary sunsets over the bay. Recently renovated from top to bottom, it offers guaranteed rental income during the high season.",
  locationNotes: "Located in the Las Brisas residential area on the eastern hillside of Acapulco Bay, Guerrero.",
  targetBuyer: "Mexico City families and investors looking for a renovated, multi-generational vacation home on the bay.",
  language: "en",
  brandVoice: "Classic Acapulco glamour, told with restraint",
  tone: ["confident", "warm", "understated"],
  channels: ["instagram", "facebook", "email"],
  images: [
    photo("img-brisa-sunset", "1544984243-ec57ea16fe25", "Pool terrace at sunset"),
    photo("img-brisa-villa", "1580587771525-78b9dba3b914", "White façade above the pool terrace"),
    photo("img-brisa-pool", "1613490493576-7fde63acd811", "Pool and terraced façade"),
    photo("img-brisa-garden", "1602343168117-bb8ffe3e2e9f", "House and pool from the lower garden"),
    photo("img-brisa-living", "1600566753086-00f18fb6b3ea", "Living room with open staircase"),
    photo("img-brisa-sitting", "1616486338812-3dadae4b4ace", "Sitting room in soft neutrals"),
  ],
  agentName: "Mariana Soto (fictional)",
  brokerage: "Bahía Real Estate (fictional)",
  contactEmail: "mariana.soto@example.com",
  contactPhone: "+52 744 000 0000",
  isFictional: true,
};

const ARRECIFE: PropertyBriefInput = {
  name: "Penthouse Arrecife",
  propertyType: "penthouse",
  neighborhood: "Puerto Cancún",
  city: "Cancún",
  country: "Mexico",
  price: { amount: 2_350_000, currency: "USD" },
  bedrooms: 3,
  bathrooms: 3.5,
  interiorArea: 410,
  landArea: null,
  areaUnit: "m2",
  yearBuilt: 2021,
  parkingSpaces: 2,
  maintenanceFee: 1_200,
  verifiedAmenities: [
    "Private rooftop terrace with plunge pool",
    "Views of the Caribbean Sea and Nichupté Lagoon",
    "Wraparound terrace on the main level",
    "Open-plan living and dining room with floor-to-ceiling glass",
    "Private elevator access",
    "Residents' pool, gym and spa",
    "24-hour concierge and controlled access",
    "Two parking spaces and a storage room",
  ],
  claimsToVerify: ["Furniture package included (seller to confirm)"],
  description:
    "The most exclusive penthouse in Cancún, ideal for young professionals and a strong short-term rental investment. Floor-to-ceiling glass frames the sea on one side and the lagoon on the other.",
  locationNotes: "Located in Puerto Cancún, between the Hotel Zone and downtown Cancún, Quintana Roo.",
  targetBuyer: "International buyers seeking a lock-and-leave home with full building services and Caribbean views.",
  language: "en",
  brandVoice: "Contemporary Caribbean — clean, bright, exact",
  tone: ["bright", "precise", "calm"],
  channels: ["instagram", "linkedin", "email"],
  images: [
    photo("img-arrecife-coast", "1499793983690-e29da59ef1c2", "Turquoise shoreline and palms"),
    photo("img-arrecife-living", "1560448204-e02f11c3d0e2", "Living room with floor-to-ceiling windows"),
    photo("img-arrecife-pool", "1520250497591-112f2f40a3f4", "Shared pool deck with palms"),
    photo("img-arrecife-terrace", "1571896349842-33c89424de2d", "Pool terrace at dusk"),
    photo("img-arrecife-bedroom", "1505693416388-ac5ce068fe85", "Bedroom suite"),
  ],
  agentName: "Sofía Medina (fictional)",
  brokerage: "Caribe Norte Properties (fictional)",
  contactEmail: "sofia.medina@example.com",
  contactPhone: "+52 998 000 0000",
  isFictional: true,
};

export interface ExampleCampaign {
  /** Fixed campaign id — example URLs never change. */
  id: string;
  key: string;
  label: string;
  brief: PropertyBriefInput;
  /** Pre-apply the Builder's validation-passed recommendations so the live page is populated. */
  preApply: boolean;
}

export const EXAMPLES: ExampleCampaign[] = [
  { id: "casa-tezontle", key: "cdmx", label: "Ciudad de México", brief: SAMPLE_BRIEF, preApply: false },
  { id: "casa-umbral", key: "valle", label: "Valle de Bravo", brief: UMBRAL, preApply: true },
  { id: "villa-marea", key: "vallarta", label: "Puerto Vallarta", brief: MAREA, preApply: true },
  { id: "casa-brisa", key: "acapulco", label: "Acapulco", brief: BRISA, preApply: true },
  { id: "penthouse-arrecife", key: "cancun", label: "Cancún", brief: ARRECIFE, preApply: true },
];

export const EXAMPLE_IDS = new Set(EXAMPLES.map((e) => e.id));
export function isExampleId(id: string): boolean {
  return EXAMPLE_IDS.has(id);
}
