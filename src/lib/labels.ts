// ============================================================
// Display labels for the domain's status vocabularies.
//
// The stage map lived in two files and the status map in three, all verbatim
// copies, so rewording a label meant finding five call sites and admin was
// free to drift from the dashboard.
//
// Admin's copy also fused the label together with its Tailwind classes in one
// record. That split matters here: the label is translated, the CSS never is,
// so they cannot share a lookup.
//
// `locale` threads through these later exactly as it does through
// src/lib/format.ts — the default reproduces today's French.
// ============================================================

import type { OrderStage } from "@/lib/order-types";

/** Tenants and team members share one lifecycle vocabulary. */
export type AccountStatus = "pending" | "active" | "suspended";

const STAGE_LABEL: Record<string, Record<OrderStage, string>> = {
  fr: {
    searching: "Recherche livreur",
    enroute: "En route",
    delivered: "Livré",
    canceled: "Annulé",
  },
  "ar-TN": {
    searching: "يستنّى في موصّل",
    enroute: "في الطريق",
    delivered: "وصل",
    canceled: "تلغى",
  },
};

const STATUS_LABEL: Record<string, Record<AccountStatus, string>> = {
  fr: {
    pending: "En attente",
    active: "Actif",
    suspended: "Suspendu",
  },
  "ar-TN": {
    pending: "في الانتظار",
    active: "مفعّل",
    suspended: "موقوف",
  },
};

/**
 * The label for a delivery stage. Fleetbase is the source of `stage` and can
 * report one we do not model, so an unknown value falls back to itself rather
 * than rendering blank. An unknown locale falls back to French, which keeps
 * admin (French-only) callers passing nothing.
 */
export function stageLabel(stage: string, locale: string = "fr"): string {
  const map = STAGE_LABEL[locale] ?? STAGE_LABEL.fr;
  return map[stage as OrderStage] ?? stage;
}

/** The label for a tenant or team-member status, falling back to itself. */
export function statusLabel(status: string, locale: string = "fr"): string {
  const map = STATUS_LABEL[locale] ?? STATUS_LABEL.fr;
  return map[status as AccountStatus] ?? status;
}
