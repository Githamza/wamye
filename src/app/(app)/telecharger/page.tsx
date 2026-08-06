import type { Metadata } from "next";
import QRCode from "qrcode";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { viewerLocale } from "@/i18n/viewer-locale";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wamye Livreur — Android",
  robots: { index: false, follow: false },
};

/**
 * Where a driver gets the Android app. One URL to send on WhatsApp; the QR is
 * for the other flow — reading this page on a desktop with the phone in hand.
 *
 * The APK lives in the public `apk` storage bucket, NOT in the repo or the
 * image: uploading a new build changes what this page serves with no deploy.
 * The link is public by design — the app is a shell over the same
 * authenticated site anyone can already open in a browser.
 */
const APK_PATH = "/storage/v1/object/public/apk/wamye-livreur.apk";

export default async function TelechargerPage() {
  const locale = await viewerLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Telecharger");

  const apkUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${APK_PATH}`;
  const qr = await QRCode.toDataURL(apkUrl, { margin: 1, width: 220 });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-4 py-8">
      <h1 className="text-[22px] font-bold leading-tight">{t("title")}</h1>
      <p className="text-[14px] leading-relaxed text-stone-muted">{t("lead")}</p>

      <a
        href={apkUrl}
        className="flex h-12 items-center justify-center rounded-[10px] bg-brand text-[15px] font-semibold text-white"
      >
        {t("download")}
      </a>

      <p className="text-[13px] leading-relaxed text-stone-muted">
        {t("installHint")}
      </p>

      <div className="flex flex-col items-center gap-2 rounded-[14px] border border-hair p-4">
        <p className="text-[13px] text-stone-muted">{t("qrHint")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing for next/image to optimize */}
        <img src={qr} alt="" width={220} height={220} />
      </div>

      <p className="text-[12px] text-stone-muted">{t("webKeeps")}</p>
    </main>
  );
}
