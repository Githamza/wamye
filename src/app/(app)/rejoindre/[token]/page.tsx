import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { viewerLocale } from "@/i18n/viewer-locale";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";
import { JoinTeamForm } from "@/components/join-team-form";
import { lookupInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";

// The URL is the capability — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The page behind a team's invitation link. A driver opens it on their phone
 * (WhatsApp, or the QR on their boss's screen), signs themselves up, and waits
 * for the owner to accept.
 *
 * Public on purpose: there is no session yet, the token stands in for auth.
 * Locale from the cookie, same as the other pre-login pages.
 */

const ERROR_KEY: Record<string, string> = {
  missing: "errorMissing",
  email: "errorEmail",
  phone: "errorPhone",
  insert: "errorInsert",
  invite: "errorInvite",
  throttled: "errorThrottled",
};

export default async function JoinPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const locale = await viewerLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Join");

  const { token } = await props.params;
  const { error } = await props.searchParams;
  const lookup = await lookupInvite(token);

  // Not a 404: the link was real, and a driver holding a stale QR needs to be
  // told to ask for a new one rather than shown a dead end.
  if (!lookup.ok) {
    return (
      <Shell locale={locale} title={t("deadTitle")}>
        <p className="text-[14px] leading-relaxed text-stone-muted">
          {t(lookup.reason === "tenant-inactive" ? "deadInactive" : "deadExpired")}
        </p>
        <Link
          href="/login"
          className="self-start text-[13px] text-brand underline underline-offset-[3px]"
        >
          {t("haveAccount")}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell locale={locale} title={t("title", { team: lookup.tenant.name })}>
      <p className="text-[14px] leading-relaxed text-stone-muted">{t("intro")}</p>

      {error && (
        <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-[13px] text-danger-ink">
          {t(ERROR_KEY[error] ?? "errorFallback")}
        </div>
      )}

      <JoinTeamForm token={token} />

      <p className="text-[12px] leading-relaxed text-stone-muted">{t("approvalHint")}</p>

      <Link
        href="/login"
        className="self-center text-[13px] text-brand underline underline-offset-[3px]"
      >
        {t("haveAccount")}
      </Link>
    </Shell>
  );
}

function Shell({
  locale,
  title,
  children,
}: {
  locale: Awaited<ReturnType<typeof viewerLocale>>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5 px-4 py-8">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-ink">{title}</h1>
        <DashboardLocaleSwitcher current={locale} />
      </div>
      {children}
    </main>
  );
}
