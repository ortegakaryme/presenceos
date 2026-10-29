import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-charcoal border border-ink",
  secondary: "bg-transparent text-ink border border-line-strong hover:border-ink hover:bg-paper",
  ghost: "bg-transparent text-charcoal border border-transparent hover:bg-sand/70",
  danger: "bg-transparent text-bad border border-bad/40 hover:bg-bad-soft",
  light: "bg-paper/95 text-ink border border-paper hover:bg-white",
};
const SIZE = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-sm" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof SIZE = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-[3px] font-medium tracking-wide transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap",
    VARIANT[variant],
    SIZE[size],
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <button type="button" className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "dark";
const TONE: Record<Tone, string> = {
  neutral: "bg-sand text-umber",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  dark: "bg-ink text-paper",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[0.6875rem] font-medium leading-4 tracking-wide", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  const color = { neutral: "bg-stone", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info", dark: "bg-ink" }[tone];
  return <span aria-hidden className={cx("inline-block size-1.5 shrink-0 rounded-full", color, pulse && "animate-pulse-soft")} />;
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-[4px] border border-line bg-paper", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2 text-taupe">{eyebrow}</p>}
        <h1 className="font-display text-3xl leading-tight text-ink md:text-[2.5rem]">{title}</h1>
        {children && <div className="mt-2 text-sm leading-relaxed text-stone">{children}</div>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="border-l border-line px-4 py-1 first:border-l-0 first:pl-0">
      <p className="eyebrow text-stone">{label}</p>
      <p className={cx("font-display mt-1 text-3xl leading-none", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink")}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[4px] border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-stone">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children: ReactNode; className?: string }) {
  const border = { neutral: "border-line-strong", ok: "border-ok/40", warn: "border-warn/40", bad: "border-bad/40", info: "border-info/30", dark: "border-ink" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-[4px] border bg-paper px-4 py-3 text-sm", border, className)}>
      {title && <p className={cx("mb-0.5 font-medium", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink")}>{title}</p>}
      <div className="leading-relaxed text-charcoal">{children}</div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-[3px] border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-stone/70 transition-colors focus:border-ink focus:outline-none aria-[invalid=true]:border-bad";

export function Field({ label, hint, error, htmlFor, children, required }: { label: string; hint?: string; error?: string; htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-charcoal">
        {label}
        {required && <span className="text-taupe"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-stone">{hint}</p>
      ) : null}
    </div>
  );
}
