"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";

/**
 * Dashboard login. Email/password is primary; "Continue with Google" appears
 * only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is set (the Google provider must be
 * enabled in Supabase first). The public ordering pages need no login.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(t("invalidCredentials"));
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(t("googleUnavailable"));
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-stone-ink">{t("heading")}</h1>
        <p className="text-[14px] text-stone-muted">{t("subheading")}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          required
          className="h-12 rounded-[10px] border border-hair bg-white px-3.5 text-[15px] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("passwordPlaceholder")}
          autoComplete="current-password"
          required
          className="h-12 rounded-[10px] border border-hair bg-white px-3.5 text-[15px] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15"
        />
        {error && <div className="text-[13px] text-danger-ink">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-hair disabled:text-stone-faint"
        >
          {busy ? t("submitting") : t("submit")}
        </button>
        <Link
          href="/auth/forgot"
          className="self-center text-[13px] text-brand underline underline-offset-[3px]"
        >
          {t("forgotPassword")}
        </Link>
      </form>

      <div className="flex flex-col gap-2 rounded-[12px] border border-brand-border bg-brand-bg p-4 text-center">
        <p className="text-[13px] leading-relaxed text-brand-ink/80">{t("signupPrompt")}</p>
        <Link
          href="/signup"
          className="self-center font-semibold text-brand underline underline-offset-[3px]"
        >
          {t("signupAction")}
        </Link>
      </div>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-[12px] text-stone-faint">
            <span className="h-px flex-1 bg-hair" /> {t("or")}{" "}
            <span className="h-px flex-1 bg-hair" />
          </div>
          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="h-12 w-full rounded-[10px] border border-hair bg-white text-[15px] font-medium text-stone-ink transition-colors hover:bg-hair-2 disabled:opacity-50"
          >
            {t("continueWithGoogle")}
          </button>
        </>
      )}
    </div>
  );
}
