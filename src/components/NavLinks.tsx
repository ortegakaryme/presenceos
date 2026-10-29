"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Overview", match: (p: string) => p === "/" },
  { href: "/campaigns/new", label: "New campaign", match: (p: string) => p === "/campaigns/new" },
  { href: "/analytics", label: "Analytics", match: (p: string) => p.startsWith("/analytics") },
  { href: "/product", label: "Product brief", match: (p: string) => p.startsWith("/product") },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined} className={cx("whitespace-nowrap rounded-[3px] px-2.5 py-1.5 text-[0.8rem] transition-colors", l.match(path) ? "bg-sand text-ink" : "text-stone hover:text-ink")}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
