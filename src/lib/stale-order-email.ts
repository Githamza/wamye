import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";

/**
 * Telling the tenant owner that a course is going nowhere.
 *
 * Two moments, two different messages:
 *   * at 30 minutes — nobody has taken it, and there is still time to phone a
 *     driver or the customer. This is the one that saves the delivery.
 *   * at expiry — it has been closed. Said plainly, because the customer is
 *     still expecting something.
 *
 * Never throws: a sweep that dies on a Brevo hiccup would stop expiring orders,
 * which is the failure this whole file exists to prevent.
 */

export type StaleOrder = {
  id: string;
  tenant_id: string;
  commerce_name: string | null;
  phone: string | null;
  created_at: string;
};

function minutesSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

function renderText(
  orders: StaleOrder[],
  kind: "unclaimed" | "expired",
  url: string,
) {
  const lines = orders.map((o) => {
    const age = minutesSince(o.created_at);
    const who = o.phone ? ` — client ${o.phone}` : "";
    return `• ${o.commerce_name ?? "Commerce"}${who} — en attente depuis ${age} min`;
  });

  return kind === "unclaimed"
    ? [
        "Personne n'a encore pris cette course.",
        "",
        ...lines,
        "",
        "Si aucun livreur n'est disponible, préviens le client : il attend.",
        url,
      ].join("\n")
    : [
        "Course annulée faute de livreur.",
        "",
        ...lines,
        "",
        "Elle n'apparaît plus chez les livreurs. Le client attend toujours une réponse.",
        url,
      ].join("\n");
}

function renderHtml(
  orders: StaleOrder[],
  kind: "unclaimed" | "expired",
  url: string,
) {
  const rows = orders
    .map((o) => {
      const age = minutesSince(o.created_at);
      return `<li style="margin:0 0 8px"><strong>${o.commerce_name ?? "Commerce"}</strong>${
        o.phone ? ` — client ${o.phone}` : ""
      } <span style="color:#78716c">— en attente depuis ${age} min</span></li>`;
    })
    .join("");

  const head =
    kind === "unclaimed"
      ? "Personne n'a encore pris cette course."
      : "Course annulée faute de livreur.";
  const foot =
    kind === "unclaimed"
      ? "Si aucun livreur n'est disponible, préviens le client : il attend."
      : "Elle n'apparaît plus chez les livreurs. Le client attend toujours une réponse.";

  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#1c1917">
  <p style="font-size:17px;font-weight:600;margin:0 0 12px">${head}</p>
  <ul style="padding-left:18px;margin:0 0 16px">${rows}</ul>
  <p style="color:#57534e;margin:0 0 16px">${foot}</p>
  <a href="${url}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Ouvrir le tableau de bord</a>
</div>`;
}

/** Owner email for a tenant — the profile with no parent. */
async function ownerEmail(tenantId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("tenant_id", tenantId)
    .is("parent_profile_id", null)
    .eq("status", "active")
    .maybeSingle();
  const email = (data?.email as string | null)?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

/** One email per tenant, listing that tenant's affected courses. */
export async function notifyOwnersOfStaleOrders(
  orders: StaleOrder[],
  kind: "unclaimed" | "expired",
): Promise<number> {
  if (orders.length === 0) return 0;

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("[stale-orders] BREVO_API_KEY missing — no owner alerted");
    return 0;
  }

  // Grouped so an owner with three stranded courses gets one email, not three.
  const byTenant = new Map<string, StaleOrder[]>();
  for (const o of orders) {
    byTenant.set(o.tenant_id, [...(byTenant.get(o.tenant_id) ?? []), o]);
  }

  const url = `${await siteOrigin()}/dashboard`;
  const sender = {
    name: "Wamye",
    email: process.env.BREVO_SENDER_EMAIL ?? "admin.wamye@mylabs.live",
  };

  let sent = 0;
  for (const [tenantId, group] of byTenant) {
    try {
      const email = await ownerEmail(tenantId);
      if (!email) {
        console.warn("[stale-orders] tenant %s has no owner email", tenantId);
        continue;
      }
      const subject =
        kind === "unclaimed"
          ? `⏳ Course sans livreur — ${group[0].commerce_name ?? "commande"}`
          : `⚠️ Course annulée faute de livreur — ${group[0].commerce_name ?? "commande"}`;

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
          htmlContent: renderHtml(group, kind, url),
          textContent: renderText(group, kind, url),
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      sent += 1;
    } catch (err) {
      console.error("[stale-orders] send failed:", (err as Error).message);
    }
  }
  return sent;
}
