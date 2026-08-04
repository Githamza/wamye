import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { viewerLocale } from "@/i18n/viewer-locale";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";
import { tokenForCode } from "@/lib/invites";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Code entry, for the half of these exchanges that happen out loud. The owner
 * reads their team code over the phone; this box turns it back into the same
 * /rejoindre/<token> page the QR would have opened. One join flow, two ways in.
 */
export default async function JoinByCodePage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const locale = await viewerLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Join");
  const { error } = await props.searchParams;

  async function submit(formData: FormData) {
    "use server";
    const token = await tokenForCode(String(formData.get("code") ?? ""));
    redirect(token ? `/rejoindre/${token}` : "/rejoindre?error=code");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-4 py-8">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-ink">{t("codeTitle")}</h1>
        <DashboardLocaleSwitcher current={locale} />
      </div>
      <p className="text-[14px] leading-relaxed text-stone-muted">{t("codeIntro")}</p>

      {error && (
        <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-[13px] text-danger-ink">
          {t("errorCode")}
        </div>
      )}

      <form action={submit} className="flex flex-col gap-3">
        <input
          name="code"
          required
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="A7K2MP"
          className="h-12 w-full rounded-[10px] border border-hair bg-white px-3.5 text-center text-[18px] font-semibold uppercase tracking-[0.3em] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15"
        />
        <button
          type="submit"
          className="h-12 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          {t("codeSubmit")}
        </button>
      </form>
    </main>
  );
}
