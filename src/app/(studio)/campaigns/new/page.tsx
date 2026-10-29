import type { Metadata } from "next";
import { IntakeForm } from "@/components/IntakeForm";
import { SectionHeading } from "@/components/ui";
import { uploadsEnabled } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaign() {
  return (
    <div className="mx-auto max-w-[88rem] px-4 py-10 md:px-8">
      <SectionHeading eyebrow="Phase 1 · Intake" title="Property brief">
        Everything the agents know comes from this brief. Required fields are marked with an asterisk.
      </SectionHeading>
      <div className="mt-8">
        <IntakeForm uploadsEnabled={uploadsEnabled()} />
      </div>
    </div>
  );
}
