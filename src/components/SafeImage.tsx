"use client";

import { useState } from "react";
import { cx } from "./ui";

/**
 * Image with a graceful, on-brand fallback when a remote photo fails to load.
 * The caption is rendered in the fallback so information is never image-only.
 */
/** Responsive candidates for CDNs that accept a width parameter (Unsplash); other URLs are used as-is. */
function srcSetFor(src: string): string | undefined {
  if (!/^https:\/\/images\.unsplash\.com\//.test(src)) return undefined;
  return [480, 828, 1200, 1680, 2200].map((w) => `${src.replace(/([?&])w=\d+/, `$1w=${w}`)} ${w}w`).join(", ");
}

export function SafeImage({ src, alt, className, caption, eager, onFail, sizes = "100vw" }: { src?: string; alt: string; className?: string; caption?: string; eager?: boolean; onFail?: () => void; sizes?: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed) {
    return (
      <div role="img" aria-label={alt} className={cx("flex items-end bg-[linear-gradient(135deg,#d9d0c2_0%,#c3b6a4_45%,#a8998a_100%)]", className)}>
        <span className="eyebrow m-4 text-paper/90">{caption ?? "Photo unavailable"}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      srcSet={src ? srcSetFor(src) : undefined}
      sizes={sizes}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cx("bg-sand object-cover", className)}
      onError={() => {
        setFailed(true);
        onFail?.();
      }}
    />
  );
}
