"use client";

import { useState, useTransition } from "react";
import { provisionTenant, type ProvisionCode, type ProvisionResult } from "@/lib/actions/tenants";

// Admin-only surface: the wording is French here, like the rest of /admin,
// rather than going through next-intl (which serves the tenant-facing app).
const MESSAGE: Record<ProvisionCode, string> = {
  provisioned: "Organisation créée et clé enregistrée.",
  "already-provisioned": "Une clé est déjà enregistrée pour ce compte.",
  "not-configured": "Identifiants admin Fleetbase absents (FLEETBASE_ADMIN_EMAIL).",
  "tenant-not-found": "Compte introuvable.",
  failed: "Échec de la création.",
};

/**
 * Create this tenant's Fleetbase organization and API key.
 *
 * Approval already does this; the button is the retry path for when Fleetbase
 * was down at that moment — approval succeeds anyway, on purpose, so the
 * account is never held hostage by the dispatch backend.
 */
export function ProvisionTenantButton({ tenantId }: { tenantId: string }) {
  const [result, setResult] = useState<ProvisionResult>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await provisionTenant(tenantId)))}
        className="h-11 rounded-[10px] border border-hair bg-white px-4 text-[14px] font-medium text-stone-ink hover:bg-hair-2 disabled:opacity-50"
      >
        {pending ? "Création…" : "Créer l'organisation Fleetbase"}
      </button>
      {result && (
        <span className={`text-[13px] ${result.ok ? "text-success" : "text-danger-ink"}`}>
          {MESSAGE[result.code]}
          {result.detail ? ` (${result.detail})` : ""}
        </span>
      )}
    </div>
  );
}
