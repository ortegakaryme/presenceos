"use client";

import { useState } from "react";
import { buttonClass, cx } from "../ui";

/** Demo inquiry form. Nothing is sent: no CRM or email service is connected. */
export function InquiryForm({ ctaLabel }: { ctaLabel: string }) {
  const [state, setState] = useState<"idle" | "invalid" | "done">("idle");
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setState(e.currentTarget.checkValidity() ? "done" : "invalid");
      }}
    >
      {(["name", "email"] as const).map((f) => (
        <label key={f} className="grid gap-2">
          <span className="eyebrow text-paper/60">{f === "name" ? "Full name" : "Email"}</span>
          <input required name={f} type={f === "email" ? "email" : "text"} autoComplete={f} className="border-b border-paper/30 bg-transparent py-2 text-paper outline-none transition-colors placeholder:text-paper/30 focus:border-paper" />
        </label>
      ))}
      <label className="grid gap-2">
        <span className="eyebrow text-paper/60">Message (optional)</span>
        <textarea name="message" rows={3} className="resize-none border-b border-paper/30 bg-transparent py-2 text-paper outline-none focus:border-paper" />
      </label>
      <button type="submit" className={cx(buttonClass("light", "lg"), "mt-2 justify-self-start")}>
        {ctaLabel}
      </button>
      <p aria-live="polite" className="text-xs leading-relaxed text-paper/60">
        {state === "done"
          ? "Demo only — this inquiry was not sent. No CRM, email or brokerage system is connected."
          : state === "invalid"
            ? "Please add your name and a valid email."
            : "Demo form. Submissions are not stored or sent."}
      </p>
    </form>
  );
}
