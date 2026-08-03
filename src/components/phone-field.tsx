"use client";

import { useState } from "react";

/**
 * Local-number input with a fixed +216 affordance.
 *
 * The dial code is decoration, not data: the field submits the 8 local digits
 * and the server puts the country back on. That is what keeps the stored value
 * in one shape — the free-text version of this field produced +216…, 216…,
 * 00216… and bare digits, and the ones carrying a prefix broke the E.164
 * conversion that Fleetbase driver records depend on.
 *
 * Paste is sanitised rather than rejected: a number copied from WhatsApp
 * arrives as "+216 20 123 456", and dropping the prefix silently is friendlier
 * than an error on something the user got right.
 */
export function PhoneField({
  name,
  defaultValue = "",
  required = false,
  id,
  /** "lg" matches the signup form's inputs, "md" the dashboard's. */
  size = "md",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  id?: string;
  size?: "md" | "lg";
}) {
  const [value, setValue] = useState(() => sanitize(defaultValue));

  return (
    <div
      className={`flex w-full items-center rounded-[10px] border border-hair bg-white pl-3.5 text-[15px] focus-within:border-brand ${
        size === "lg"
          ? "h-12 focus-within:ring-[3px] focus-within:ring-brand/15"
          : "h-11"
      }`}
    >
      <span className="select-none pr-2 text-stone-muted2" aria-hidden="true">
        +216
      </span>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(sanitize(e.target.value))}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="20 123 456"
        required={required}
        // Mirrors isValidPhone server-side: 8 digits, Tunisian mobiles start
        // 2/4/5/9. The browser message is generic, so the server still words it.
        pattern="[2459][0-9]{7}"
        aria-describedby={`${name}-hint`}
        className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-stone-ink outline-none"
      />
    </div>
  );
}

/** Keep 8 local digits, dropping any country prefix the user pasted along. */
function sanitize(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00216")) digits = digits.slice(5);
  else if (digits.startsWith("216") && digits.length > 8) digits = digits.slice(3);
  return digits.slice(0, 8);
}
