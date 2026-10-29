import { describe, expect, it } from "vitest";
import { PropertyBriefSchema } from "@/lib/domain/schemas";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import { checkText, indexBrief, stripFlaggedSentences } from "@/lib/builder/factcheck";
import { validateValue, validationContext } from "@/lib/builder/validation";

const brief = PropertyBriefSchema.parse(SAMPLE_BRIEF);
const idx = indexBrief(brief);
const codes = (t: string) => checkText(t, idx).map((i) => i.code);

describe("fact and compliance checks", () => {
  it("accepts copy that matches the brief", () => {
    expect(checkText("Five bedrooms and 6.5 bathrooms across 1,120 m², offered at MXN 89,500,000. Covered parking for four cars.", idx)).toEqual([]);
  });
  it("flags numeric mismatches as critical", () => {
    const issues = checkText("A six-bedroom home with 2,000 m² of space, offered at MXN 75,000,000.", idx);
    expect(issues.filter((i) => i.code === "factual_mismatch")).toHaveLength(3);
    expect(issues.every((i) => i.severity === "critical")).toBe(true);
  });
  it("separates unsupported amenities from user claims awaiting verification", () => {
    expect(codes("Relax in the home gym.")).toContain("unsupported_amenity");
    expect(codes("Enjoy the heated pool.")).toContain("unverified_claim");
    expect(codes("Temperature-controlled wine room and solar panels.")).toEqual([]);
  });
  it("flags superlatives, exclusionary and financial language", () => {
    expect(codes("One of the most exclusive homes, perfect for families.")).toEqual(expect.arrayContaining(["unsupported_superlative", "exclusionary_language"]));
    expect(checkText("Guaranteed returns for investors.", idx).some((i) => i.severity === "critical")).toBe(true);
  });
  it("strips only flagged sentences", () => {
    const r = stripFlaggedSentences("A private garden. Views of the Chapultepec forest. Five bedrooms.", idx);
    expect(r.text).toBe("A private garden. Five bedrooms.");
    expect(r.removed).toHaveLength(1);
  });
  it("blocks images that depict unverified amenities and unknown ids", () => {
    const vc = validationContext(brief, []);
    expect(validateValue("landing.galleryImageIds", ["img-living", "img-terrace"], vc).status).toBe("blocked");
    expect(validateValue("landing.heroImageId", "nope", vc).status).toBe("blocked");
    expect(validateValue("landing.heroImageId", "img-dusk", vc).status).toBe("passed");
  });
  it("rejects values that do not match the field schema", () => {
    const v = validateValue("landing.features", "not an array", validationContext(brief, []));
    expect(v.valid).toBe(false);
  });
});
