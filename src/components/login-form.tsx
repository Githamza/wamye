"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Dashboard login. Email/password is primary; "Continue with Google" appears
 * only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is set (the Google provider must be
 * enabled in Supabase first). The public ordering pages need no login.
 */
export function LoginForm({ next }: { next: string }) {
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
      setError("Identifiants invalides.");
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
      setError("Connexion Google indisponible.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-stone-ink">Espace livreur</h1>
        <p className="text-[14px] text-stone-muted">Connectez-vous à votre tableau de bord.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          required
          className="h-12 rounded-[10px] border border-hair bg-white px-3.5 text-[15px] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
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
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <a
          href="/auth/forgot"
          className="self-center text-[13px] text-brand underline underline-offset-[3px]"
        >
          Mot de passe oublié ?
        </a>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-[12px] text-stone-faint">
            <span className="h-px flex-1 bg-hair" /> ou <span className="h-px flex-1 bg-hair" />
          </div>
          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="h-12 w-full rounded-[10px] border border-hair bg-white text-[15px] font-medium text-stone-ink transition-colors hover:bg-hair-2 disabled:opacity-50"
          >
            Continuer avec Google
          </button>
        </>
      )}
    </div>
  );
}
