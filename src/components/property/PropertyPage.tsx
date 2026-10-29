import type { CampaignContent, PropertyBrief, SectionKey } from "@/lib/domain/schemas";
import { formatArea, formatPrice } from "@/lib/format";
import { SafeImage } from "../SafeImage";
import { PropertyNav } from "./PropertyNav";
import { InquiryForm } from "./InquiryForm";

const SECTION_LINK: Partial<Record<SectionKey, string>> = { story: "Residence", gallery: "Gallery", features: "Features", location: "Location" };

export function PropertyPage({ brief, content, banner }: { brief: PropertyBrief; content: CampaignContent; banner?: React.ReactNode }) {
  const L = content.landing;
  const img = (id: string) => brief.images.find((i) => i.id === id);
  const hero = img(L.heroImageId);
  const gallery = L.galleryImageIds.map(img).filter((x): x is NonNullable<typeof x> => !!x);
  const cta = L.ctaLabel || "Contact the listing agent";
  const order = (L.sectionOrder.length ? L.sectionOrder : ["facts", "gallery", "amenities", "inquiry"]) as SectionKey[];
  const has: Record<SectionKey, boolean> = {
    facts: true,
    story: !!L.intro || L.description.length > 0,
    gallery: gallery.length > 0,
    features: L.features.length > 0,
    amenities: brief.verifiedAmenities.length > 0,
    location: !!L.locationCopy,
    inquiry: true,
  };
  const visible = order.filter((s) => has[s]);
  if (!visible.includes("inquiry")) visible.push("inquiry");

  const facts = [
    { label: "Price", value: formatPrice(brief.price.amount, brief.price.currency) },
    { label: "Bedrooms", value: String(brief.bedrooms) },
    { label: "Bathrooms", value: String(brief.bathrooms) },
    { label: "Interior", value: formatArea(brief.interiorArea, brief.areaUnit) },
    ...(brief.landArea ? [{ label: "Land", value: formatArea(brief.landArea, brief.areaUnit) }] : []),
    ...(brief.yearBuilt ? [{ label: "Built", value: String(brief.yearBuilt) }] : []),
    ...(brief.parkingSpaces ? [{ label: "Parking", value: `${brief.parkingSpaces} cars` }] : []),
  ];

  const sections: Record<SectionKey, () => React.ReactNode> = {
    facts: () => (
      <section key="facts" aria-label="Key facts" className="border-b border-line bg-paper">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-4 py-10 sm:grid-cols-4 md:px-10 lg:grid-cols-[1.7fr_repeat(6,1fr)]">
          {facts.map((f) => (
            <div key={f.label} className="border-l border-line pl-4">
              <dt className="eyebrow text-stone">{f.label}</dt>
              <dd className="font-display mt-1.5 whitespace-nowrap text-2xl text-ink md:text-[1.7rem]">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    ),
    story: () => (
      <section key="story" id="residence" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-12 md:px-10 md:py-28">
        <div className="md:col-span-5">
          <p className="eyebrow mb-5 text-taupe">The residence</p>
          {L.intro && <p className="font-display text-[1.75rem] leading-[1.25] text-ink md:text-[2.1rem]">{L.intro}</p>}
        </div>
        <div className="space-y-5 text-[0.975rem] leading-[1.8] text-charcoal md:col-span-6 md:col-start-7 md:pt-10">
          {L.description.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>
    ),
    gallery: () => (
      <section key="gallery" id="gallery" aria-label="Gallery" className="bg-paper py-20 md:py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-10">
          <div className="mb-10 flex items-end justify-between">
            <h2 className="font-display text-4xl text-ink md:text-5xl">Gallery</h2>
            <p className="eyebrow text-stone">{gallery.length} photographs</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {gallery.map((g, i) => {
              // Lead image + two stacked, then an even 3-up grid — works for any count.
              const tail = (gallery.length - 3) % 3; // leftover tiles in the last 3-up row
              const lastRow = i >= gallery.length - tail && i >= 3;
              const span = i === 0 ? "lg:col-span-4 lg:row-span-2" : lastRow ? (tail === 1 ? "lg:col-span-6" : "lg:col-span-3") : "lg:col-span-2";
              return (
                <figure key={g.id} className={`group relative overflow-hidden ${span}`}>
                  <SafeImage src={g.url} alt={g.caption} caption={g.caption} sizes={i === 0 || lastRow ? "(min-width: 1024px) 66vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} className={`h-full w-full transition-transform duration-700 group-hover:scale-[1.02] ${i === 0 ? "aspect-[4/3] lg:aspect-auto" : lastRow && tail === 1 ? "aspect-[4/3] lg:aspect-[21/9]" : "aspect-[4/3]"}`} />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent px-4 pb-3 pt-10 text-xs tracking-wide text-paper">{g.caption}</figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>
    ),
    features: () => (
      <section key="features" id="features" className="mx-auto max-w-7xl px-4 py-20 md:px-10 md:py-28">
        <h2 className="font-display mb-12 text-4xl text-ink md:text-5xl">Features</h2>
        <ol className="grid gap-x-12 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {L.features.map((f, i) => (
            <li key={i} className="border-b border-line py-7">
              <p className="eyebrow mb-3 text-taupe">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="font-display text-2xl text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone">{f.body}</p>
            </li>
          ))}
        </ol>
      </section>
    ),
    amenities: () => (
      <section key="amenities" aria-label="Verified amenities" className="border-y border-line bg-sand/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-12 md:px-10">
          <div className="md:col-span-4">
            <h2 className="font-display text-3xl text-ink md:text-4xl">Amenities</h2>
            <p className="mt-3 text-xs leading-relaxed text-stone">Amenities listed as verified in the property brief.</p>
          </div>
          <ul className="grid gap-x-10 gap-y-3 text-sm text-charcoal sm:grid-cols-2 md:col-span-8">
            {brief.verifiedAmenities.map((a) => (
              <li key={a} className="flex gap-3 border-b border-line-strong/50 pb-3">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-taupe" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </section>
    ),
    location: () => (
      <section key="location" id="location" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:grid-cols-12 md:px-10 md:py-28">
        <div className="md:col-span-5">
          <p className="eyebrow mb-5 text-taupe">Location</p>
          <h2 className="font-display text-4xl leading-tight text-ink md:text-5xl">
            {brief.neighborhood}
            <span className="block text-stone">{brief.city}</span>
          </h2>
        </div>
        <div className="md:col-span-6 md:col-start-7 md:pt-12">
          <p className="text-[0.975rem] leading-[1.8] text-charcoal">{L.locationCopy}</p>
          <p className="mt-6 text-xs text-stone">Location details as supplied by the listing agent. No map or third-party neighbourhood data is shown.</p>
        </div>
      </section>
    ),
    inquiry: () => (
      <section key="inquiry" id="inquire" className="bg-charcoal text-paper">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-20 md:grid-cols-2 md:px-10 md:py-28">
          <div>
            <p className="eyebrow mb-5 text-paper/50">Inquire</p>
            <h2 className="font-display text-4xl leading-tight md:text-5xl">{cta}</h2>
            {L.ctaSupport && <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/70">{L.ctaSupport}</p>}
            <div className="mt-10 space-y-1 text-sm text-paper/80">
              <p className="font-display text-2xl text-paper">{brief.agentName}</p>
              <p>{brief.brokerage}</p>
              <p>
                <a className="underline decoration-paper/30 underline-offset-4 hover:decoration-paper" href={`mailto:${brief.contactEmail}`}>
                  {brief.contactEmail}
                </a>
              </p>
              {brief.contactPhone && (
                <p>
                  <a className="underline decoration-paper/30 underline-offset-4 hover:decoration-paper" href={`tel:${brief.contactPhone.replace(/[^\d+]/g, "")}`}>
                    {brief.contactPhone}
                  </a>
                </p>
              )}
            </div>
          </div>
          <InquiryForm ctaLabel={cta} />
        </div>
      </section>
    ),
  };

  return (
    <div id="top" className="bg-ivory">
      <PropertyNav brokerage={brief.brokerage} ctaLabel={cta} links={visible.filter((s) => SECTION_LINK[s]).map((s) => ({ href: `#${s === "story" ? "residence" : s}`, label: SECTION_LINK[s]! }))} />
      <section className="relative flex h-[92svh] max-h-[60rem] min-h-[34rem] items-end overflow-hidden bg-charcoal">
        <SafeImage src={hero?.url} alt={hero?.caption ?? brief.name} caption={hero?.caption} eager className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-ink/30" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-32 text-paper md:px-10 md:pb-20">
          <p className="eyebrow mb-5 text-paper/80">
            {brief.neighborhood} · {brief.city}
          </p>
          <h1 className="font-display max-w-4xl text-[2.75rem] leading-[1.02] md:text-7xl lg:text-[5.5rem]">{L.heroHeadline || brief.name}</h1>
          {L.heroSubheadline && <p className="mt-6 max-w-xl text-base leading-relaxed text-paper/85 md:text-lg">{L.heroSubheadline}</p>}
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a href="#inquire" className="eyebrow bg-paper px-6 py-4 text-ink transition-colors hover:bg-white">
              {cta}
            </a>
            <p className="font-display text-2xl text-paper">{formatPrice(brief.price.amount, brief.price.currency)}</p>
          </div>
        </div>
      </section>
      {visible.map((s) => sections[s]())}
      <footer className="bg-ink text-paper/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 text-xs md:flex-row md:justify-between md:px-10">
          <div>
            <p className="eyebrow mb-2 tracking-[0.32em] text-paper">{brief.brokerage.replace(/\s*\(fictional\)\s*/i, "")}</p>
            <p>{brief.name} · {brief.neighborhood}, {brief.city}, {brief.country}</p>
          </div>
          <p className="max-w-lg leading-relaxed">
            {brief.isFictional
              ? "Fictional demonstration property created with PresenceOS. Not a real listing; not connected to any brokerage, MLS or listing feed. Photography is stock imagery used for illustration."
              : "Information supplied by the listing agent. Verify all details independently."}
          </p>
        </div>
      </footer>
      {banner}
    </div>
  );
}
