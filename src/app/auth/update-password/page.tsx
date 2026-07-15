"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Landing page for password-recovery links. The Supabase browser client
 * auto-consumes the recovery token from the URL (detectSessionInUrl), giving a
 * short-lived session; the user then sets a new password.
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
    // Handle the PKCE ?code= variant explicitly; hash tokens are auto-consumed.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    (async () => {
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
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
      setError(error.message);
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
