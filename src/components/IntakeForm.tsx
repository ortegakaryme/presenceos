"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CHANNELS, CURRENCIES, PROPERTY_TYPES, PropertyBriefSchema, type PropertyBriefInput } from "@/lib/domain/schemas";
import { CASA_UMBRAL_TEXT, EXAMPLES, INTAKE_DEFAULTS, STOCK_PHOTOS } from "@/lib/domain/examples";
import { parseListing, type ParseResult } from "@/lib/intake/parse";
import { api, ApiError } from "@/lib/client/api";
import { Button, Field, inputClass, Notice, cx } from "./ui";
import { SafeImage } from "./SafeImage";

type Img = { id: string; url: string; caption: string; source: "url" | "upload" };
interface FormState {
  name: string; propertyType: (typeof PROPERTY_TYPES)[number]; neighborhood: string; city: string; country: string;
  priceAmount: string; currency: (typeof CURRENCIES)[number];
  bedrooms: string; bathrooms: string; interiorArea: string; landArea: string; areaUnit: "m2" | "sqft";
  yearBuilt: string; parkingSpaces: string; maintenanceFee: string;
  verifiedAmenities: string; claimsToVerify: string; description: string; locationNotes: string;
  targetBuyer: string; language: "en" | "es"; brandVoice: string; tone: string; channels: string[];
  images: Img[]; agentName: string; brokerage: string; contactEmail: string; contactPhone: string; isFictional: boolean;
}

const EMPTY: FormState = {
  name: "", propertyType: "house", neighborhood: "", city: "", country: INTAKE_DEFAULTS.country, priceAmount: "", currency: "MXN",
  bedrooms: "", bathrooms: "", interiorArea: "", landArea: "", areaUnit: "m2", yearBuilt: "", parkingSpaces: "", maintenanceFee: "",
  verifiedAmenities: "", claimsToVerify: "", description: "", locationNotes: "", targetBuyer: INTAKE_DEFAULTS.targetBuyer, language: "en",
  brandVoice: INTAKE_DEFAULTS.brandVoice, tone: INTAKE_DEFAULTS.tone.join(", "), channels: [...INTAKE_DEFAULTS.channels],
  images: [], agentName: INTAKE_DEFAULTS.agentName, brokerage: INTAKE_DEFAULTS.brokerage, contactEmail: INTAKE_DEFAULTS.contactEmail, contactPhone: INTAKE_DEFAULTS.contactPhone, isFictional: true,
};

function fromBrief(b: PropertyBriefInput): FormState {
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  return {
    name: b.name, propertyType: b.propertyType ?? "house", neighborhood: b.neighborhood, city: b.city, country: b.country, priceAmount: s(b.price.amount), currency: b.price.currency,
    bedrooms: s(b.bedrooms), bathrooms: s(b.bathrooms), interiorArea: s(b.interiorArea), landArea: s(b.landArea), areaUnit: b.areaUnit,
    yearBuilt: s(b.yearBuilt), parkingSpaces: s(b.parkingSpaces), maintenanceFee: s(b.maintenanceFee),
    verifiedAmenities: b.verifiedAmenities.join("\n"), claimsToVerify: (b.claimsToVerify ?? []).join("\n"), description: b.description,
    locationNotes: b.locationNotes ?? "", targetBuyer: b.targetBuyer, language: b.language, brandVoice: b.brandVoice, tone: b.tone.join(", "),
    channels: [...b.channels], images: b.images.map((i) => ({ id: i.id, url: i.url, caption: i.caption, source: i.source ?? "url" })),
    agentName: b.agentName, brokerage: b.brokerage, contactEmail: b.contactEmail, contactPhone: b.contactPhone ?? "", isFictional: b.isFictional ?? true,
  };
}

const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/,/g, "")));
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function toBrief(f: FormState): unknown {
  return {
    name: f.name, propertyType: f.propertyType, neighborhood: f.neighborhood, city: f.city, country: f.country,
    price: { amount: num(f.priceAmount), currency: f.currency },
    bedrooms: num(f.bedrooms), bathrooms: num(f.bathrooms), interiorArea: num(f.interiorArea), landArea: numOrNull(f.landArea), areaUnit: f.areaUnit,
    yearBuilt: numOrNull(f.yearBuilt), parkingSpaces: numOrNull(f.parkingSpaces), maintenanceFee: numOrNull(f.maintenanceFee),
    verifiedAmenities: lines(f.verifiedAmenities), claimsToVerify: lines(f.claimsToVerify), description: f.description, locationNotes: f.locationNotes,
    targetBuyer: f.targetBuyer, language: f.language, brandVoice: f.brandVoice, tone: f.tone.split(",").map((t) => t.trim()).filter(Boolean),
    channels: f.channels, images: f.images, agentName: f.agentName, brokerage: f.brokerage, contactEmail: f.contactEmail, contactPhone: f.contactPhone, isFictional: f.isFictional,
  };
}

/** Maps schema paths (e.g. "price.amount", "images.0.caption") to form keys. */
function formErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const p = i.path.map(String);
    const key = p[0] === "price" ? (p[1] === "amount" ? "priceAmount" : "currency") : p[0] === "images" && p.length > 1 ? `images.${p[1]}.${p[2]}` : p[0] ?? "brief";
    out[key] ??= i.message;
  }
  return out;
}

export function IntakeForm({ uploadsEnabled = true }: { uploadsEnabled?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [injectFailure, setInjectFailure] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<(ParseResult & { stockAdded: boolean }) | null>(null);
  const [loadedExample, setLoadedExample] = useState<string | null>(null);

  const fillFromText = () => {
    const r = parseListing(paste);
    const current = toBrief(f) as PropertyBriefInput;
    const stockAdded = f.images.length === 0;
    const merged = {
      ...current,
      ...r.brief,
      price: r.brief.price ?? current.price,
      images: stockAdded ? STOCK_PHOTOS[r.setting] : current.images,
      tone: current.tone,
      channels: current.channels,
    } as PropertyBriefInput;
    setF(fromBrief({ ...merged, price: merged.price ?? { amount: undefined as unknown as number, currency: "MXN" } }));
    setParsed({ ...r, stockAdded });
    setLoadedExample(null);
    setErrors({});
    setTouched(false);
    requestAnimationFrame(() => document.getElementById("fill-summary")?.focus());
  };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!f.landArea) m.push("Land area");
    if (!f.yearBuilt) m.push("Year built");
    if (!f.parkingSpaces) m.push("Parking spaces");
    if (!f.maintenanceFee) m.push("Maintenance fees");
    if (!f.locationNotes.trim()) m.push("Location notes (location copy will be minimal)");
    if (f.images.length < 4) m.push("At least four photos for a full gallery");
    return m;
  }, [f]);

  const validate = () => {
    const r = PropertyBriefSchema.safeParse(toBrief(f));
    const e = r.success ? {} : formErrors(r.error.issues);
    setErrors(e);
    return r.success;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!validate()) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await api<{ id: string }>("/api/campaigns", { body: { brief: toBrief(f), injectFailure } });
      router.push(`/campaigns/${id}/agents`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      setServerError(err instanceof Error ? err.message : "Could not create the campaign.");
      setSubmitting(false);
    }
  };

  const err = (k: string) => (touched ? errors[k] : undefined);
  const text = (k: keyof FormState, label: string, opts: { hint?: string; required?: boolean; type?: string; placeholder?: string; inputMode?: "decimal" | "numeric" } = {}) => (
    <Field label={label} htmlFor={k} hint={opts.hint} error={err(k)} required={opts.required}>
      <input
        id={k}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        placeholder={opts.placeholder}
        className={inputClass}
        value={f[k] as string}
        aria-invalid={!!err(k)}
        aria-describedby={err(k) ? `${k}-error` : undefined}
        onChange={(e) => set(k, e.target.value as never)}
        onBlur={() => touched && validate()}
      />
    </Field>
  );
  const area = (k: keyof FormState, label: string, rows: number, opts: { hint?: string; required?: boolean } = {}) => (
    <Field label={label} htmlFor={k} hint={opts.hint} error={err(k)} required={opts.required}>
      <textarea id={k} rows={rows} className={inputClass} value={f[k] as string} aria-invalid={!!err(k)} aria-describedby={err(k) ? `${k}-error` : undefined} onChange={(e) => set(k, e.target.value as never)} onBlur={() => touched && validate()} />
    </Field>
  );

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      set("images", [...f.images, { id: `img-${Date.now().toString(36)}`, url: data.url, caption: file.name.replace(/\.[a-z]+$/i, "").replace(/[-_]/g, " "), source: "upload" }]);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const Section = ({ n, title, desc, children }: { n: string; title: string; desc: string; children: React.ReactNode }) => (
    <section className="grid gap-6 border-t border-line py-10 md:grid-cols-12">
      <div className="md:col-span-4">
        <p className="eyebrow text-taupe">{n}</p>
        <h2 className="font-display mt-1 text-2xl text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone">{desc}</p>
      </div>
      <div className="grid gap-5 md:col-span-8">{children}</div>
    </section>
  );

  return (
    <form onSubmit={submit} noValidate>
      <section aria-labelledby="quick-h" className="mb-10 grid gap-6 rounded-[4px] border border-line bg-paper p-5 md:grid-cols-12 md:p-7">
        <div className="md:col-span-4">
          <p className="eyebrow text-taupe">Quick start</p>
          <h2 id="quick-h" className="font-display mt-1 text-3xl text-ink">Paste a listing</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone">Paste a property description in Spanish or English. PresenceOS reads the price, areas, bedrooms, bathrooms, parking, location and amenities and fills in the form below for you to review.</p>
          <p className="mt-3 text-xs text-stone">Rule-based extraction in your browser — no AI call, nothing is sent until you submit.</p>
        </div>
        <div className="grid gap-3 md:col-span-8">
          <label htmlFor="paste" className="sr-only">Listing text</label>
          <textarea id="paste" rows={8} className={inputClass} placeholder={"# Casa …\n**Residencia en Colonia, Ciudad**\n\nDescripción…\n\n- Precio: $…\n- Terreno: … m²\n- Recámaras: …"} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={paste.trim().length < 40} onClick={fillFromText}>Fill the form from this text</Button>
            <Button variant="ghost" size="sm" onClick={() => setPaste(CASA_UMBRAL_TEXT)}>Paste sample text (Casa Umbral)</Button>
          </div>
          {parsed && (
            <div id="fill-summary" tabIndex={-1} className="rounded-[3px] border border-ok/30 bg-ok-soft/40 p-3 text-sm outline-none">
              <p className="font-medium text-ok">Filled {parsed.filled.length} fields — review them below before submitting.</p>
              <p className="mt-1 text-xs text-charcoal">{parsed.filled.join(" · ")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-charcoal">
                {parsed.notes.map((n) => <li key={n}>{n}</li>)}
                {parsed.stockAdded && <li>No photos yet, so {STOCK_PHOTOS[parsed.setting].length} illustrative stock photos ({parsed.setting} setting) were added. Replace them with the property’s own photography.</li>}
                <li>Contact and brand fields use fictional demo defaults — change them if needed.</li>
              </ul>
            </div>
          )}
          <div className="mt-1 border-t border-line pt-4">
            <p className="eyebrow mb-2 text-stone">Or load an example brief</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex.key} type="button" aria-pressed={loadedExample === ex.key} onClick={() => { setF(fromBrief(ex.brief)); setLoadedExample(ex.key); setParsed(null); setErrors({}); setTouched(false); }} className={cx("rounded-[3px] border px-3 py-1.5 text-xs transition-colors", loadedExample === ex.key ? "border-ink bg-ink text-paper" : "border-line-strong text-charcoal hover:border-ink")}>
                  {ex.label} · {ex.brief.name}
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => { setF(EMPTY); setParsed(null); setLoadedExample(null); setErrors({}); setTouched(false); }}>Clear form</Button>
            </div>
          </div>
        </div>
      </section>

      {touched && Object.keys(errors).length > 0 && (
        <Notice tone="bad" title={`${Object.keys(errors).length} field${Object.keys(errors).length > 1 ? "s need" : " needs"} attention`} className="mb-6">
          <ul className="list-disc pl-5">
            {Object.entries(errors).slice(0, 8).map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </Notice>
      )}

      {Section({ n: "01", title: "Property", desc: "Structured facts become the verified source of truth. Agents may not contradict them.", children: (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {text("name", "Property name", { required: true })}
            <Field label="Property type" htmlFor="propertyType">
              <select id="propertyType" className={inputClass} value={f.propertyType} onChange={(e) => set("propertyType", e.target.value as FormState["propertyType"])}>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </Field>
            {text("neighborhood", "Neighborhood", { required: true })}
            {text("city", "City", { required: true })}
            {text("country", "Country", { required: true })}
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-2">{text("priceAmount", "Asking price", { required: true, inputMode: "numeric", placeholder: "89500000" })}</div>
            <Field label="Currency" htmlFor="currency">
              <select id="currency" className={inputClass} value={f.currency} onChange={(e) => set("currency", e.target.value as FormState["currency"])}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-4">
            {text("bedrooms", "Bedrooms", { required: true, inputMode: "numeric" })}
            {text("bathrooms", "Bathrooms", { required: true, inputMode: "decimal", hint: "Halves allowed" })}
            {text("interiorArea", "Interior area", { required: true, inputMode: "decimal" })}
            {text("landArea", "Land area", { inputMode: "decimal" })}
          </div>
          <div className="grid gap-5 sm:grid-cols-4">
            <Field label="Area unit" htmlFor="areaUnit">
              <select id="areaUnit" className={inputClass} value={f.areaUnit} onChange={(e) => set("areaUnit", e.target.value as FormState["areaUnit"])}>
                <option value="m2">m²</option>
                <option value="sqft">sq ft</option>
              </select>
            </Field>
            {text("yearBuilt", "Year built", { inputMode: "numeric" })}
            {text("parkingSpaces", "Parking spaces", { inputMode: "numeric" })}
            {text("maintenanceFee", "Monthly fees", { inputMode: "numeric" })}
          </div>
        </>
      ) })}

      {Section({ n: "02", title: "Facts and claims", desc: "Separate what is documented from what still needs verification. Unverified claims are blocked from published copy.", children: (
        <>
          {area("verifiedAmenities", "Verified amenities", 7, { required: true, hint: "One per line. Only list what is documented (floor plan, inspection, listing agreement)." })}
          {area("claimsToVerify", "Claims to verify", 3, { hint: "One per line — e.g. views, pool, permits. Agents must not state these as fact." })}
          {area("description", "Property description", 5, { required: true, hint: "Free text from the seller or agent. Treated as user-provided, not verified." })}
          {area("locationNotes", "Location notes", 3, { hint: "Only facts you can stand behind. Location copy uses nothing else." })}
        </>
      ) })}

      {Section({ n: "03", title: "Audience and brand", desc: "Guides the strategy agents. The Brand Strategist turns this into enforceable guardrails.", children: (
        <>
          {area("targetBuyer", "Target buyer segment", 3, { required: true })}
          <div className="grid gap-5 sm:grid-cols-2">
            {text("brandVoice", "Brand voice", { required: true })}
            {text("tone", "Tone words", { required: true, hint: "Comma-separated" })}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Preferred language" htmlFor="language" hint={f.language === "es" ? "Demo templates are English-only; Spanish output needs model mode." : undefined}>
              <select id="language" className={inputClass} value={f.language} onChange={(e) => set("language", e.target.value as FormState["language"])}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
            </Field>
            <fieldset aria-invalid={!!err("channels")}>
              <legend className="mb-1.5 text-xs font-medium text-charcoal">Marketing channels <span className="text-taupe">*</span></legend>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const on = f.channels.includes(c);
                  return (
                    <label key={c} className={cx("cursor-pointer rounded-[3px] border px-3 py-1.5 text-xs capitalize transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-umber", on ? "border-ink bg-ink text-paper" : "border-line-strong text-charcoal hover:border-ink")}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => set("channels", on ? f.channels.filter((x) => x !== c) : [...f.channels, c])} />
                      {c}
                    </label>
                  );
                })}
              </div>
              {err("channels") && <p className="mt-1.5 text-xs text-bad">{err("channels")}</p>}
            </fieldset>
          </div>
        </>
      ) })}

      {Section({ n: "04", title: "Photography", desc: "Captions matter: agents cannot see pixels, so a caption describing an unverified amenity will be flagged.", children: (
        <>
          <ul className="grid gap-3">
            {f.images.map((img, i) => (
              <li key={img.id} className="grid grid-cols-[4.5rem_1fr_auto] items-start gap-3 rounded-[3px] border border-line bg-paper p-2">
                <SafeImage src={img.url} alt={img.caption} caption="—" className="aspect-square w-[4.5rem]" />
                <div className="grid gap-2">
                  <input aria-label={`Photo ${i + 1} URL`} className={cx(inputClass, "py-1.5 text-xs")} value={img.url} readOnly={img.source === "upload"} aria-invalid={!!err(`images.${i}.url`)} onChange={(e) => set("images", f.images.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <input aria-label={`Photo ${i + 1} caption`} placeholder="What does this photo show?" className={cx(inputClass, "py-1.5 text-xs")} value={img.caption} aria-invalid={!!err(`images.${i}.caption`)} onChange={(e) => set("images", f.images.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
                  {(err(`images.${i}.url`) || err(`images.${i}.caption`)) && <p className="text-xs text-bad">{err(`images.${i}.url`) ?? err(`images.${i}.caption`)}</p>}
                </div>
                <Button variant="ghost" size="sm" aria-label={`Remove photo ${i + 1}`} onClick={() => set("images", f.images.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {err("images") && <p className="text-xs text-bad">{err("images")}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => set("images", [...f.images, { id: `img-${Date.now().toString(36)}`, url: "https://", caption: "", source: "url" }])}>
              Add image URL
            </Button>
            {uploadsEnabled ? <label className={cx("inline-flex h-8 cursor-pointer items-center rounded-[3px] border border-line-strong px-3 text-xs font-medium hover:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-umber", uploading && "opacity-50")}>
              {uploading ? "Uploading…" : "Upload photo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
            </label> : <span className="self-center text-xs text-stone">Photo upload is off on this hosted demo — paste image URLs instead.</span>}
          </div>
        </>
      ) })}

      {Section({ n: "05", title: "Listing contact", desc: "Shown on the public page. Use example.com addresses for demos.", children: (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {text("agentName", "Listing agent", { required: true })}
            {text("brokerage", "Brokerage", { required: true })}
            {text("contactEmail", "Inquiry email", { required: true, type: "email" })}
            {text("contactPhone", "Phone")}
          </div>
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input type="checkbox" checked={f.isFictional} onChange={(e) => set("isFictional", e.target.checked)} className="accent-ink" />
            This is a fictional demo property (adds a disclaimer to the public page)
          </label>
        </>
      ) })}

      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-ivory/95 px-4 py-4 backdrop-blur md:mx-0 md:px-0">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-stone">
            {missing.length > 0 ? (
              <span>
                <span className="font-medium text-warn">Recommended but missing:</span> {missing.join(" · ")}
              </span>
            ) : (
              "All recommended details supplied."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-stone" title="Makes Agent 02 return a malformed response on its first attempt, to demonstrate Builder validation and retry.">
              <input type="checkbox" checked={injectFailure} onChange={(e) => setInjectFailure(e.target.checked)} className="accent-ink" />
              Inject a malformed agent response
            </label>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit brief & run agents"}
            </Button>
          </div>
        </div>
        {serverError && <p role="alert" className="mt-2 text-xs text-bad">{serverError}</p>}
      </div>
    </form>
  );
}
