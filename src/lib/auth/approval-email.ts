import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";

/**
 * "approved": a super-admin validated a self-registered account — the user
 * already chose a password at signup, so the mail just points at /login.
 * "created": a super-admin provisioned the login directly (no password yet),
 * so the mail carries a one-time recovery link to set one.
 */
export type AccountReadyKind = "approved" | "created";

const COPY: Record<
  AccountReadyKind,
  { subject: string; headline: string; body: string; cta: string; footer: string }
> = {
  approved: {
    subject: "Votre compte Wamye est validé ✓",
    headline: "Compte validé ✓",
    body: "Bonne nouvelle — votre compte livreur a été validé. Connectez-vous avec votre adresse email et votre mot de passe pour accéder à votre tableau de bord.",
    cta: "Se connecter au tableau de bord",
    footer:
      "Mot de passe oublié ? Utilisez « Mot de passe oublié » sur la page de connexion.",
  },
  created: {
    subject: "Votre compte Wamye est prêt",
    headline: "Votre compte est prêt",
    body: "Un compte Wamye a été créé pour vous. Cliquez sur le bouton pour définir votre mot de passe et accéder à votre tableau de bord.",
    cta: "Définir mon mot de passe",
    footer:
      "Ce lien est à usage unique et expire rapidement. S'il ne fonctionne plus, utilisez « Mot de passe oublié » sur la page de connexion.",
  },
};

function renderHtml(
  kind: AccountReadyKind,
  actionLink: string,
  navigatorConnectUrl?: string,
): string {
  const { headline, body, cta, footer } = COPY[kind];
  // No install instructions here on purpose: the connect page behind the
  // link walks the driver through install-then-connect itself.
  const navigatorBlock = navigatorConnectUrl
    ? `
      <hr style="margin:28px 0;border:none;border-top:1px solid #99F6E4">
      <h2 style="margin:0 0 8px;font-size:16px;color:#134E4A">Étape suivante : l'application Navigator</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">
        Ouvrez ce lien <strong>sur votre téléphone</strong> et laissez-vous guider :
        c'est dans Navigator que vous recevrez vos courses.
      </p>
      <a href="${navigatorConnectUrl}"
         style="display:inline-block;background:#ffffff;color:#0F766E;border:1px solid #0F766E;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">
        Connecter Navigator
      </a>`
    : "";
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#F0FDFA;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #99F6E4;border-radius:12px;padding:32px 28px">
      <div style="font-size:28px">🛵</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#134E4A">${headline}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">${body}</p>
      <a href="${actionLink}"
         style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">
        ${cta}
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777">
        ${footer}
      </p>${navigatorBlock}
    </div>
  </body>
</html>`;
}

/**
 * Best-effort "your account is ready" email — never throws, the calling
 * approval must stand even when the mail fails.
 *
 * Preferred path: a Brevo transactional send (custom French copy). The
 * button's target depends on the kind: "approved" users chose a password at
 * signup, so it links straight to /login; "created" logins have no password
 * yet, so it carries a one-time Supabase recovery link (minted with
 * generateLink — Supabase builds the URL but sends nothing itself) landing
 * on /auth/update-password.
 *
 * Without BREVO_API_KEY (or if Brevo/generateLink fails) it falls back to
 * Supabase's own recovery mail — stock "Reset password" template. Its link
 * still signs the user in, so it works for both kinds, just with the wrong
 * headline for "approved".
 */
export async function sendAccountReadyEmail(
  email: string,
  kind: AccountReadyKind = "approved",
  /** Tenant's /connect/<token> URL; when present the mail adds a
   *  "next step: connect Navigator" section. Optional — the account mail
   *  must go out even when the token can't be resolved. */
  navigatorConnectUrl?: string,
): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error(
        "[account-ready] BREVO_API_KEY missing at runtime — falling back to Supabase recovery template",
      );
      return await sendSupabaseFallback(email);
    }

    const origin = await siteOrigin();
    let actionLink: string;
    if (kind === "approved") {
      // The user set their password at signup — plain login link, nothing
      // one-time to mint.
      actionLink = `${origin}/login`;
    } else {
      const supabase = createAdminClient();
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${origin}/auth/update-password` },
      });
      const link = data?.properties?.action_link;
      if (error || !link) {
        console.error(`generateLink for ${email} failed:`, error?.message);
        return await sendSupabaseFallback(email);
      }
      actionLink = link;
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
        htmlContent: renderHtml(kind, actionLink, navigatorConnectUrl),
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
  await sendPasswordResetEmail(email);
}

/**
 * Recovery email via Supabase's stock template — also the "Mot de passe
 * oublié" flow. Sent with the admin client (not the visitor's browser client)
 * so the link (a) carries the canonical SITE_URL origin whichever host the
 * visitor used, and (b) is an implicit-flow link that works in any browser —
 * a PKCE link minted in the browser dies when the email is opened elsewhere.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/update-password`,
  });
  if (error) console.error(`recovery email to ${email} failed:`, error.message);
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
