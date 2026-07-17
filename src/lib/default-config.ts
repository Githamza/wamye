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
};
