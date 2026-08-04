// ============================================================
// New-order alert emails to drivers — SERVER ONLY.
//
// Web Push reaches a driver only once they have installed the app and granted
// the permission, and on iPhone not at all until both. Email asks nothing of
// anyone, so it stays the channel that always works — the floor under the
// push, not a leftover from the Fleetbase era.
//
// Recipients used to come from Fleetbase's driver list. They now come from
// `profiles`, which is the roster the app itself maintains.
//
// Best-effort by design: an alert failure must never fail the customer's
// order, so this module logs and swallows every error.
// ============================================================

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import type { CreateOrderInput } from "@/lib/order-types";

function renderHtml(input: CreateOrderInput, openUrl: string): string {
  const fee = input.fee != null ? `${input.fee} DT` : null;
  const distance = input.distanceKm != null ? `${input.distanceKm} km` : null;
  const facts = [
    `<strong>Retrait :</strong> ${escapeHtml(input.commerceName)}`,
    fee && `<strong>Frais de livraison :</strong> ${fee}`,
    distance && `<strong>Distance :</strong> ~${distance}`,
  ]
    .filter(Boolean)
    .join("<br>");

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#F0FDFA;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #99F6E4;border-radius:12px;padding:32px 28px">
      <div style="font-size:28px">🛵</div>
      <h1 style="margin:12px 0 8px;font-size:20px;color:#134E4A">Nouvelle course disponible</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">${facts}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">
        Ouvrez votre tableau de bord pour voir le détail et accepter la course —
        premier arrivé, premier servi.
      </p>
      <a href="${openUrl}"
         style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">
        Voir la course
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777">
        Si la course n'apparaît plus, c'est qu'un autre livreur de l'équipe l'a
        déjà prise.
      </p>
    </div>
  </body>
</html>`;
}

// A text/plain part must accompany the HTML — HTML-only mail (plus Brevo's
// tracking pixel counting as an image) scores MIME_HTML_ONLY and
// HTML_IMAGE_ONLY with spam filters.
function renderText(input: CreateOrderInput, openUrl: string): string {
  const facts = [
    `Retrait : ${input.commerceName}`,
    input.fee != null && `Frais de livraison : ${input.fee} DT`,
    input.distanceKm != null && `Distance : ~${input.distanceKm} km`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Nouvelle course disponible

${facts}

Ouvrez votre tableau de bord pour voir le détail et accepter la course — premier arrivé, premier servi.

${openUrl}

Si la course n'apparaît plus, c'est qu'un autre livreur de l'équipe l'a déjà prise.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Email every driver of the tenant's Fleetbase company that a new order is
 * up for grabs. Never throws.
 */
export async function sendNewOrderAlertEmails(
  tenantId: string,
  input: CreateOrderInput,
): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error(
        "[order-alert] BREVO_API_KEY missing — no driver alert sent",
      );
      return;
    }

    // Active members of this tenant — owner and sub-drivers alike. A pending or
    // suspended member is deliberately left out: they cannot take the course.
    const supabase = createAdminClient();
    const { data: members, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .not("email", "is", null);

    if (error) {
      console.error("[order-alert] roster read failed:", error.message);
      return;
    }

    const emails = [
      ...new Set(
        (members ?? [])
          .map((m) => ((m.email as string | null) ?? "").trim().toLowerCase())
          .filter((e) => e.includes("@")),
      ),
    ];
    if (emails.length === 0) {
      console.warn(
        "[order-alert] tenant %s has no active member with an email — nobody alerted",
        tenantId,
      );
      return;
    }

    // Straight to the feed. /ouvrir was a relay that fired the Navigator deep
    // link; the course is now taken in the app this link opens.
    const openUrl = `${await siteOrigin()}/dashboard`;
    const html = renderHtml(input, openUrl);
    const text = renderText(input, openUrl);
    const subject = `🛵 Nouvelle course — ${input.commerceName}`;
    const sender = {
      name: "Wamye",
      // Fallback sur le domaine authentifié — un expéditeur non validé
      // (ex. gmail) est accepté par l'API puis rejeté à l'envoi.
      email: process.env.BREVO_SENDER_EMAIL ?? "admin.wamye@mylabs.live",
    };

    const results = await Promise.allSettled(
      emails.map(async (email) => {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            sender,
            to: [{ email }],
            subject,
            htmlContent: html,
            textContent: text,
          }),
        });
        if (!res.ok) {
          throw new Error(`${email}: ${res.status} ${await res.text()}`);
        }
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    for (const f of failed) {
      console.error(
        "[order-alert] send failed:",
        (f as PromiseRejectedResult).reason,
      );
    }
    console.log(
      `[order-alert] alerted ${emails.length - failed.length}/${emails.length} driver(s)`,
    );
  } catch (err) {
    console.error("[order-alert] failed:", (err as Error).message);
  }
}
