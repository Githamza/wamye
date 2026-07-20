"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

type CopyState = "idle" | "ok" | "err";

// The origin never changes within a page, so there is nothing to subscribe to.
const noopSubscribe = () => () => {};

/**
 * The tenant's public ordering page, ready to paste into WhatsApp/Instagram.
 * Shared by the whole team: the link is keyed on the tenant slug, so an owner
 * and their sub-drivers all point customers at the same page.
 *
 * The origin is read on mount rather than from an env var — there is no
 * NEXT_PUBLIC_APP_URL, and a NEXT_PUBLIC_* one would inline at Docker build
 * time. Rendering the bare path until then keeps the first client render
 * identical to the server's.
 */
export function ShopLink({ slug }: { slug: string }) {
  const t = useTranslations("Dashboard.shopLink");
  const [copied, setCopied] = useState<CopyState>("idle");
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    if (copied === "idle") return;
    const t = setTimeout(() => setCopied("idle"), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const path = `/t/${slug}`;
  const url = origin ? `${origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      // Insecure origin or a denied permission — the text stays selectable.
      setCopied("err");
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-hair bg-white p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-stone-ink">{t("title")}</span>
        {copied !== "idle" && (
          <span className={`text-[12px] ${copied === "ok" ? "text-success" : "text-danger-ink"}`}>
            {copied === "ok" ? t("copied") : t("copyFailed")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded-[8px] bg-hair-2 px-2.5 py-2 text-[13px] text-stone-muted2"
        >
          {url.replace(/^https?:\/\//, "")}
        </code>
        <button
          type="button"
          onClick={copy}
          className="h-9 flex-none rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2"
        >
          {t("copy")}
        </button>
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 flex-none rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium leading-9 text-stone-ink transition-colors hover:bg-hair-2"
        >
          {t("open")}
        </a>
      </div>

      <p className="text-[12px] leading-relaxed text-stone-muted">{t("hint")}</p>
    </div>
  );
}
