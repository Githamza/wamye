// ============================================================
// The default tenant config — reproduces the exact hardcoded Djerba
// values the app shipped with. Used as a fallback until a tenant's
// config is loaded from the database (see tenant.ts), and as the seed
// for the "djerba" tenant.
// ============================================================

import type { TenantPublicConfig } from "@/lib/config-types";

// Testing flag — forces the shop open 24/7 so the flow can be exercised at
// any time. Becomes a per-tenant `hours.alwaysOpen` setting; kept here for
// the default tenant to preserve current behavior.
const ALWAYS_OPEN = process.env.NEXT_PUBLIC_ALWAYS_OPEN === "true";

export const DEFAULT_TENANT_CONFIG: TenantPublicConfig = {
  slug: "djerba",
  branding: {
    name: "Livraison Djerba",
    logoEmoji: "🛵",
    areaLabel: "Djerba & Midoun",
    supportPhone: "+21622483921",
  },
  // Midoun / Djerba reference point; 22 km covers the whole island + Midoun.
  zone: { centerLat: 33.808, centerLng: 10.995, radiusKm: 22 },
  feeConfig: { baseFee: 2.5, feePerKm: 0.6, minFee: 3 },
  hours: { openHour: 11, closeHour: 23, alwaysOpen: ALWAYS_OPEN },
  phoneCountry: "TN",
  commerces: [
    { id: "ali", name: "Chez Ali", addr: "Av. Habib Bourguiba, Midoun" },
    { id: "hamadi", name: "Chez Hamadi — Grillades", addr: "Route de la plage, Djerba Houmt Souk" },
    { id: "salem", name: "Chez Salem — Épicerie", addr: "Rue de la Liberté, Midoun" },
    { id: "farhat", name: "Pâtisserie Farhat", addr: "Place Sidi Mahrez, Houmt Souk" },
    { id: "pharma", name: "Pharmacie de la Corniche", addr: "Av. de la Corniche, Aghir" },
    { id: "monoprix", name: "Monoprix Djerba", addr: "Zone touristique, Midoun" },
  ],
};

/** Pure filter over a tenant's commerce list (replaces the old global search). */
export function searchCommerces(
  commerces: TenantPublicConfig["commerces"],
  query: string,
): TenantPublicConfig["commerces"] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return commerces
    .filter((c) => c.name.toLowerCase().includes(q) || c.addr.toLowerCase().includes(q))
    .slice(0, 5);
}
