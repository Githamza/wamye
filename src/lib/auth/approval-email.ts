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

// Every Brevo send must carry a text/plain part alongside the HTML: with only
// a text/html MIME part, spam filters score MIME_HTML_ONLY and — because the
// open-tracking pixel counts as an image — HTML_IMAGE_ONLY on top.
function renderText(kind: AccountReadyKind, actionLink: string): string {
  const { headline, body, cta, footer } = COPY[kind];
  return `${headline}

${body}

${cta} : ${actionLink}

${footer}

Vous recevez cet email car un compte Wamye est associé à cette adresse.`;
}

function renderHtml(kind: AccountReadyKind, actionLink: string): string {
  const { headline, body, cta, footer } = COPY[kind];
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#ECFEFF;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #A5F3FC;border-radius:12px;padding:32px 28px">
      <div style="font-size:28px">🛵</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#164E63">${headline}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">${body}</p>
      <a href="${actionLink}"
         style="display:inline-block;background:#00819F;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">
        ${cta}
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777">
        ${footer}
      </p>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#999">
        Vous recevez cet email car un compte Wamye est associé à cette adresse.
      </p>
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
        htmlContent: renderHtml(kind, actionLink),
        textContent: renderText(kind, actionLink),
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

/**
 * Best-effort "merci pour votre inscription" acknowledgement, sent right after
 * public self-registration. The account exists but sits behind super-admin
 * approval, so the mail sets expectations (48–72h) instead of linking anywhere.
 * Never throws — signup must succeed even when the mail fails — and has no
 * Supabase fallback: a stock recovery mail would be misleading here.
 */
export async function sendSignupReceivedEmail(
  email: string,
  name?: string,
): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error("[signup-received] BREVO_API_KEY missing — mail skipped");
      return;
    }

    const greeting = name ? `Bonjour ${name},` : "Bonjour,";
    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#ECFEFF;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #A5F3FC;border-radius:12px;padding:32px 28px">
      <div style="font-size:28px">🛵</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#164E63">Merci pour votre inscription !</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#333">${greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#333">
        Votre compte Wamye a bien été créé et est en cours de validation par notre équipe.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">
        Nous revenons vers vous dès que votre compte est validé —
        cela peut prendre de <strong>48 à 72&nbsp;heures</strong>.
      </p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777">
        Vous recevrez un email de confirmation dès la validation. Aucune action n'est nécessaire de votre part d'ici là.
      </p>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#999">
        Vous recevez cet email car une inscription Wamye a été effectuée avec cette adresse.
      </p>
    </div>
  </body>
</html>`;

    const text = `Merci pour votre inscription !

${greeting}

Votre compte Wamye a bien été créé et est en cours de validation par notre équipe.

Nous revenons vers vous dès que votre compte est validé — cela peut prendre de 48 à 72 heures.

Vous recevrez un email de confirmation dès la validation. Aucune action n'est nécessaire de votre part d'ici là.

Vous recevez cet email car une inscription Wamye a été effectuée avec cette adresse.`;

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
        subject: "Merci pour votre inscription — compte en cours de validation",
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) {
      console.error(
        `[signup-received] Brevo send to ${email} failed:`,
        res.status,
        await res.text(),
      );
    }
  } catch (err) {
    console.error(`[signup-received] email to ${email} failed:`, err);
  }
}

/**
 * Best-effort "someone wants to join your team" nudge to the owner.
 *
 * No Supabase fallback and no link beyond the team page: the request is
 * already sitting there, this mail only shortens the wait. Never throws — the
 * join must succeed even when the mail does not.
 */
export async function sendJoinRequestEmail(
  ownerEmail: string,
  candidate: { name: string; phone: string },
): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error("[join-request] BREVO_API_KEY missing — mail skipped");
      return;
    }

    const teamUrl = `${await siteOrigin()}/dashboard/team`;
    const who = `${candidate.name} (+216 ${candidate.phone})`;

    const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#ECFEFF;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #A5F3FC;border-radius:12px;padding:32px 28px">
      <div style="font-size:28px">🛵</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#164E63">Une demande pour rejoindre votre équipe</h1>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#333">
        <strong>${who}</strong> a utilisé votre lien d'invitation et attend votre réponse.
      </p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">
        Tant que vous n'avez pas accepté, cette personne ne voit aucune de vos courses.
      </p>
      <a href="${teamUrl}"
         style="display:inline-block;background:#00819F;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">
        Voir la demande
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#999">
        Vous recevez cet email car vous gérez une équipe de livreurs sur Wamye.
      </p>
    </div>
  </body>
</html>`;

    const text = `Une demande pour rejoindre votre équipe

${who} a utilisé votre lien d'invitation et attend votre réponse.

Tant que vous n'avez pas accepté, cette personne ne voit aucune de vos courses.

Voir la demande : ${teamUrl}

Vous recevez cet email car vous gérez une équipe de livreurs sur Wamye.`;

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
        to: [{ email: ownerEmail }],
        subject: `${candidate.name} veut rejoindre votre équipe`,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) {
      console.error(
        `[join-request] Brevo send to ${ownerEmail} failed:`,
        res.status,
        await res.text(),
      );
    }
  } catch (err) {
    console.error(`[join-request] email to ${ownerEmail} failed:`, err);
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
