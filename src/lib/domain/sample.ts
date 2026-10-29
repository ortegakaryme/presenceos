import type { PropertyBriefInput } from "./schemas";

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=2000&q=80`;

/**
 * Fictional demo property. Every detail is invented for demonstration purposes.
 * It is not a real listing and is not connected to any brokerage or listing feed.
 *
 * The brief intentionally contains realistic problems for the agents to catch:
 * - The free-text description uses unsupported superlatives ("most exclusive", "best"),
 *   potentially exclusionary language ("perfect for families") and an unverified view claim.
 * - One supplied photo shows a pool terrace, but a pool is not a verified amenity.
 * - Maintenance fees are not supplied.
 */
export const SAMPLE_BRIEF: PropertyBriefInput = {
  name: "Casa Tezontle",
  neighborhood: "Lomas de Chapultepec",
  city: "Mexico City",
  country: "Mexico",
  price: { amount: 89_500_000, currency: "MXN" },
  bedrooms: 5,
  bathrooms: 6.5,
  interiorArea: 1120,
  landArea: 1450,
  areaUnit: "m2",
  yearBuilt: 1978,
  parkingSpaces: 4,
  maintenanceFee: null,
  verifiedAmenities: [
    "Private garden with mature jacaranda trees",
    "Double-height living room with clerestory windows",
    "Chef's kitchen with professional range and separate service kitchen",
    "Primary suite with private terrace and dressing room",
    "Library and home office",
    "Temperature-controlled wine room",
    "Covered parking for four cars",
    "Staff quarters with independent entrance",
    "Solar panels and rainwater harvesting system",
    "Full architectural renovation completed in 2023",
  ],
  claimsToVerify: [
    "Unobstructed views of the Chapultepec forest from the primary terrace",
    "Heated pool on the lower terrace (seller to confirm)",
  ],
  description:
    "Casa Tezontle is one of the most exclusive homes in Lomas de Chapultepec. Originally built in 1978 and fully renovated in 2023, the house pairs warm timber with floor-to-ceiling glass. The living spaces open onto a private garden shaded by mature jacarandas, and the primary terrace enjoys unobstructed views of the Chapultepec forest. Minutes from the best restaurants in Polanco, it is perfect for families.",
  locationNotes:
    "Set on a tree-lined, controlled-access street in Lomas de Chapultepec, in the Miguel Hidalgo borough of Mexico City. The listing agent notes the property is approximately 10 minutes by car from Polanco, traffic permitting.",
  targetBuyer:
    "Established executives and relocating international buyers seeking privacy, garden space and architectural character within Mexico City.",
  language: "en",
  brandVoice: "Quiet luxury — editorial, restrained, precise",
  tone: ["understated", "warm", "architectural"],
  channels: ["instagram", "linkedin", "email"],
  images: [
    { id: "img-dusk", url: img("1600585154340-be6161a56a0c"), caption: "Garden façade at dusk beneath a mature tree", source: "url" },
    { id: "img-garden", url: img("1600607688969-a5bfcd646154"), caption: "Garden elevation by day", source: "url" },
    { id: "img-living", url: img("1618221195710-dd6b41faaea6"), caption: "Living room with clerestory windows and garden views", source: "url" },
    { id: "img-family", url: img("1600607687939-ce8a6c25118c"), caption: "Family room with timber-clad wall", source: "url" },
    { id: "img-kitchen", url: img("1556912173-3bb406ef7e77"), caption: "Kitchen with professional range", source: "url" },
    { id: "img-entry", url: img("1600585154526-990dced4db0d"), caption: "Entrance with timber screen at night", source: "url" },
    { id: "img-suite", url: img("1616594039964-ae9021a400a0"), caption: "Primary bedroom", source: "url" },
    { id: "img-bath", url: img("1600566752355-35792bedcfea"), caption: "Primary bath with freestanding tub", source: "url" },
    { id: "img-terrace", url: img("1600573472550-8090b5e0745e"), caption: "Lower terrace with pool", source: "url" },
  ],
  agentName: "Valeria Montes (fictional)",
  brokerage: "Atelier Norte Properties (fictional)",
  contactEmail: "valeria.montes@example.com",
  contactPhone: "+52 55 0000 0000",
  isFictional: true,
};
