"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * The two ways an owner actually sends the connect link to a driver:
 * copy it, or hand it straight to WhatsApp. Client component only because
 * of the clipboard; the WhatsApp button is a plain link.
 */
export function NavigatorShareActions({ url }: { url: string }) {
  const t = useTranslations("Dashboard.navigator");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard denied (http dev origin, old browser) — the WhatsApp
      // button and the QR remain as ways to move the link.
    }
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(t("waText", { url }))}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="h-9 rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium text-stone-ink hover:bg-hair-2"
      >
        {copied ? t("copied") : t("copy")}
      </button>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="h-9 rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium leading-9 text-stone-ink hover:bg-hair-2"
      >
        {t("whatsapp")}
      </a>
    </div>
  );
}
