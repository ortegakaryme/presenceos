"use client";

import { useEffect, useState } from "react";
import { cx } from "../ui";

export function PropertyNav({ brokerage, links, ctaLabel }: { brokerage: string; links: { href: string; label: string }[]; ctaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const mark = brokerage.replace(/\s*\(fictional\)\s*/i, "");
  return (
    <header className={cx("fixed inset-x-0 top-0 z-40 transition-colors duration-300", solid || open ? "bg-paper/95 text-ink shadow-[0_1px_0_var(--color-line)] backdrop-blur" : "bg-transparent text-paper")}>
      <nav aria-label="Property" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-10">
        <a href="#top" className="eyebrow text-[0.75rem] tracking-[0.32em]">
          {mark}
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="eyebrow opacity-80 transition-opacity hover:opacity-100">
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href="#inquire" className={cx("eyebrow border px-4 py-2.5 transition-colors", solid ? "border-ink hover:bg-ink hover:text-paper" : "border-paper/70 hover:bg-paper hover:text-ink")}>
              {ctaLabel}
            </a>
          </li>
        </ul>
        <button type="button" className="eyebrow md:hidden" aria-expanded={open} aria-controls="property-menu" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Menu"}
        </button>
      </nav>
      {open && (
        <ul id="property-menu" className="border-t border-line bg-paper px-4 pb-6 md:hidden">
          {[...links, { href: "#inquire", label: ctaLabel }].map((l) => (
            <li key={l.href} className="border-b border-line">
              <a href={l.href} onClick={() => setOpen(false)} className="font-display block py-4 text-2xl">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
