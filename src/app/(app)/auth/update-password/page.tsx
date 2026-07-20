"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Supabase words its errors in English. Mapping the codes this form can
 * actually provoke keeps the page in one language; `error.message` used to be
 * rendered raw, so a French UI would answer with "New password should be
 * different from the old password."
 */
const AUTH_ERROR: Record<string, string> = {
  weak_password: "Mot de passe trop faible — choisissez-en un plus long ou plus complexe.",
  same_password: "Ce mot de passe est identique à l'ancien.",
  session_not_found: "Lien expiré. Demandez un nouveau lien.",
  session_expired: "Lien expiré. Demandez un nouveau lien.",
  reauthentication_needed: "Reconnectez-vous avant de changer votre mot de passe.",
  over_request_rate_limit: "Trop de tentatives. Réessayez dans quelques minutes.",
  validation_failed: "Mot de passe invalide.",
};

const AUTH_ERROR_FALLBACK = "Impossible de mettre à jour le mot de passe. Réessayez.";

/** `code` is undefined when the request failed before any response (offline). */
function authErrorMessage(code: string | undefined): string {
  return (code && AUTH_ERROR[code]) || AUTH_ERROR_FALLBACK;
}

/**
 * Landing page for password-recovery links. Recovery links arrive in two
 * shapes and both must be handled by hand:
 *
 *   - `?code=`            — PKCE callback (resetPasswordForEmail from a
 *                           browser that holds the code verifier).
 *   - `#access_token=...` — implicit-flow tokens (links minted server-side
 *                           with admin.generateLink, e.g. the account-ready
 *                           email). The browser client is configured for PKCE,
 *                           and in that mode detectSessionInUrl ignores hash
 *                           tokens entirely — so we consume them explicitly
 *                           with setSession.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const code = new URLSearchParams(window.location.search).get("code");
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    (async () => {
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
      } else if (accessToken && refreshToken) {
        await supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .catch(() => {});
        // Scrub the one-time tokens from the address bar (and from anything
        // that copies it) once they're in the session cookie.
        window.history.replaceState(null, "", window.location.pathname);
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setHasSession(Boolean(session));
      setReady(true);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(authErrorMessage(error.code));
      setBusy(false);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace("/dashboard");
      router.refresh();
    }, 900);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-5 p-6">
      <h1 className="text-xl font-semibold text-stone-ink">Nouveau mot de passe</h1>

      {!ready ? (
        <p className="text-[14px] text-stone-muted">Vérification du lien…</p>
      ) : !hasSession ? (
        <p className="text-[14px] text-danger-ink">
          Lien invalide ou expiré. Demandez un nouveau lien depuis « Mot de passe oublié ».
        </p>
      ) : done ? (
        <p className="text-[14px] text-success">Mot de passe mis à jour ✓ — redirection…</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nouveau mot de passe"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-12 rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
          />
          {error && <div className="text-[13px] text-danger-ink">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-[10px] bg-brand text-[15px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "…" : "Enregistrer"}
          </button>
        </form>
      )}
    </div>
  );
}
