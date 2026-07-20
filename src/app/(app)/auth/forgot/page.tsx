"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Server action, not the browser client: the emailed link then carries
    // the canonical SITE_URL origin and opens fine in any browser (a PKCE
    // link minted here would only work in this one).
    await requestPasswordReset(email).catch(() => {});
    // Always report success (don't reveal whether the email exists).
    setSent(true);
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-5 p-6">
      <h1 className="text-xl font-semibold text-stone-ink">Mot de passe oublié</h1>

      {sent ? (
        <p className="text-[14px] text-stone-muted">
          Si un compte existe pour cet email, un lien de réinitialisation vient d&apos;être envoyé.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            className="h-12 rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-[10px] bg-brand text-[15px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Envoyer le lien"}
          </button>
        </form>
      )}
    </div>
  );
}
