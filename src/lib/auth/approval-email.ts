import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** Origin of the current request (proxy-aware), for links in outgoing emails. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * "approved": a super-admin validated the account. "created": a super-admin
 * provisioned it directly (born active, so it never goes through approval).
 * Same mail either way apart from the headline — both audiences just need
 * the link that lets them set a password and get in.
 */
export type AccountReadyKind = "approved" | "created";

const COPY: Record<AccountReadyKind, { subject: string; headline: string; body: string }> = {
  approved: {
    subject: "Votre compte Wamye est validé ✓",
    headline: "Compte validé ✓",
    body: "Bonne nouvelle — votre compte livreur a été validé. Cliquez sur le bouton pour définir votre mot de passe et accéder à votre tableau de bord.",
  },
  created: {
    subject: "Votre compte Wamye est prêt",
    headline: "Votre compte est prêt",
    body: "Un compte Wamye a été créé pour vous. Cliquez sur le bouton pour définir votre mot de passe et accéder à votre tableau de bord.",
  },
};

function renderHtml(kind: AccountReadyKind, actionLink: string): string {
  const { headline, body } = COPY[kind];
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#F0FDFA;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #99F6E4;border-radius:12px;padding:32px 28px">
      <div style="font-size:28px">🛵</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#134E4A">${headline}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">${body}</p>
      <a href="${actionLink}"
         style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">
        Accéder à mon compte
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777">
        Ce lien est à usage unique et expire rapidement. S'il ne fonctionne plus,
        utilisez « Mot de passe oublié » sur la page de connexion.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Best-effort "your account is ready" email — never throws, the calling
 * approval must stand even when the mail fails.
 *
 * Preferred path: a Brevo transactional send (custom French copy) carrying a
 * Supabase recovery link minted with generateLink — Supabase builds the
 * one-time login URL but sends nothing itself. The link lands on
 * /auth/update-password, where the driver sets a password and ends up
 * signed-in on the dashboard; that suits both admin-provisioned logins (no
 * password yet) and self-registered ones.
 *
 * Without BREVO_API_KEY (or if Brevo/generateLink fails) it falls back to
 * Supabase's own recovery mail — same link, stock "Reset password" template.
 */
export async function sendAccountReadyEmail(
  email: string,
  kind: AccountReadyKind = "approved",
): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return await sendSupabaseFallback(email);

    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${await requestOrigin()}/auth/update-password` },
    });
    const actionLink = data?.properties?.action_link;
    if (error || !actionLink) {
      console.error(`generateLink for ${email} failed:`, error?.message);
      return await sendSupabaseFallback(email);
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Wamye",
          email: process.env.BREVO_SENDER_EMAIL ?? "hamza.haddad.dev@gmail.com",
        },
        to: [{ email }],
        subject: COPY[kind].subject,
        htmlContent: renderHtml(kind, actionLink),
      }),
    });
    if (!res.ok) {
      console.error(`Brevo send to ${email} failed:`, res.status, await res.text());
      return await sendSupabaseFallback(email);
    }
  } catch (err) {
    console.error(`approval email to ${email} failed:`, err);
  }
}

async function sendSupabaseFallback(email: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/auth/update-password`,
  });
  if (error) console.error(`fallback recovery email to ${email} failed:`, error.message);
}

/**
 * Look up the auth email of the owner (parent-less tenant_admin) of a tenant.
 * Returns null when the tenant has no owner profile yet.
 */
export async function tenantOwnerEmail(tenantId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: owner } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "tenant_admin")
    .is("parent_profile_id", null)
    .limit(1)
    .maybeSingle();
  if (!owner) return null;

  const { data } = await supabase.auth.admin.getUserById(owner.id);
  return data?.user?.email ?? null;
}
