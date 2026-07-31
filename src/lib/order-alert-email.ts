// ============================================================
// New-order alert emails to drivers — SERVER ONLY.
//
// This self-hosted Fleetbase instance cannot push to the official Navigator
// app (the store build carries Fleetbase's own Firebase identity), so the
// adhoc "ping" reaches nobody whose app is closed. This is the stand-in:
// when an order is created, email every driver of the tenant's company so
// they open Navigator and accept it there.
//
// Best-effort by design: an alert failure must never fail the customer's
// order, so this module logs and swallows every error.
// ============================================================

import "server-only";
import { createFleetbaseClient, type FleetbaseContext } from "@/lib/fleetbase";
import type { CreateOrderInput } from "@/lib/order-types";

function renderHtml(input: CreateOrderInput): string {
  const fee =
    input.fee != null ? `${input.fee} DT` : null;
  const distance =
    input.distanceKm != null ? `${input.distanceKm} km` : null;
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
        Ouvrez l'application <strong>Navigator</strong> sur votre téléphone pour
        voir le détail et accepter la course — premier arrivé, premier servi.
      </p>
      <a href="flbnavigator://"
         style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">
        Ouvrir Navigator
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777">
        Si le bouton ne fait rien, ouvrez simplement l'application Navigator
        et tirez la liste des commandes vers le bas pour la rafraîchir.
      </p>
    </div>
  </body>
</html>`;
}

// A text/plain part must accompany the HTML — HTML-only mail (plus Brevo's
// tracking pixel counting as an image) scores MIME_HTML_ONLY and
// HTML_IMAGE_ONLY with spam filters.
function renderText(input: CreateOrderInput): string {
  const facts = [
    `Retrait : ${input.commerceName}`,
    input.fee != null && `Frais de livraison : ${input.fee} DT`,
    input.distanceKm != null && `Distance : ~${input.distanceKm} km`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Nouvelle course disponible

${facts}

Ouvrez l'application Navigator sur votre téléphone pour voir le détail et accepter la course — premier arrivé, premier servi.

Si rien ne s'affiche, tirez la liste des commandes vers le bas pour la rafraîchir.`;
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
  ctx: FleetbaseContext,
  input: CreateOrderInput,
): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error("[order-alert] BREVO_API_KEY missing — no driver alert sent");
      return;
    }

    const drivers = await createFleetbaseClient(ctx).listDrivers();
    const emails = [
      ...new Set(
        drivers
          .map((d) => (d.email ?? "").trim().toLowerCase())
          .filter((e) => e.includes("@")),
      ),
    ];
    if (emails.length === 0) {
      console.warn(
        "[order-alert] tenant has no driver with an email — nobody alerted",
      );
      return;
    }

    const html = renderHtml(input);
    const text = renderText(input);
    const subject = `🛵 Nouvelle course — ${input.commerceName}`;
    const sender = {
      name: "Wamye",
      email: process.env.BREVO_SENDER_EMAIL ?? "hamza.haddad.dev@gmail.com",
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
