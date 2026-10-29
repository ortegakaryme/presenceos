import Link from "next/link";
import { resolveMode } from "@/lib/agents/llm";
import { NavLinks } from "./NavLinks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mode, model, reason } = resolveMode();
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-6 px-4 md:px-8">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-[1.4rem] leading-none text-ink">Presence</span>
            <span className="eyebrow text-taupe">OS</span>
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-2 text-[0.7rem] text-stone" title={reason}>
            <span className={`inline-block size-1.5 rounded-full ${mode === "model" ? "bg-ok" : "bg-warn"}`} aria-hidden />
            <span className="hidden sm:inline">{mode === "model" ? `Model mode · ${model}` : "Demo mode · deterministic agents, no model calls"}</span>
            <span className="sm:hidden">{mode === "model" ? "Model" : "Demo"}</span>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mx-auto max-w-[88rem] px-4 py-10 text-[0.7rem] leading-relaxed text-stone md:px-8">
        PresenceOS is an independent product prototype. Not affiliated with any brokerage or real-estate platform. Sample property data is fictional.
      </footer>
    </div>
  );
}
