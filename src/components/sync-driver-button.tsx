"use client";

import { useState, useTransition } from "react";
import { syncDriverToFleetbase, type SyncCode, type SyncResult } from "@/lib/actions/team";

/** The wording lives here, not in the action: this component knows the reader. */
const SYNC_MESSAGE: Record<SyncCode, string> = {
  created: "Livreur créé dans Fleetbase ✓",
  "already-synced": "Déjà synchronisé ✓",
  "member-not-found": "Membre introuvable.",
  forbidden: "Non autorisé.",
  "phone-missing": "Numéro de téléphone manquant.",
  "no-fleetbase-key": "Aucune clé Fleetbase pour ce compte. Connectez Fleetbase d'abord.",
  "email-not-found": "E-mail introuvable.",
  "fleetbase-error": "Échec de la synchronisation.",
  failed: "Échec de la synchronisation.",
};

function syncMessage(result: NonNullable<SyncResult>): string {
  // Fleetbase's own status and text are more useful than a generic failure.
  if (result.detail) {
    return `Échec (${result.detail.status}) : ${result.detail.message}`;
  }
  return SYNC_MESSAGE[result.code];
}

/**
 * Register a team member as a driver in the tenant's Fleetbase company. The
 * sync is retryable on purpose: approval must never hard-fail on a Fleetbase
 * outage, so it stays a separate, explicit step.
 */
export function SyncDriverButton({
  profileId,
  synced,
}: {
  profileId: string;
  synced: boolean;
}) {
  const [result, setResult] = useState<SyncResult>(null);
  const [pending, start] = useTransition();

  if (synced && !result) {
    return <span className="text-[13px] text-success">Fleetbase ✓</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await syncDriverToFleetbase(profileId)))}
        className="h-9 rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium text-stone-ink hover:bg-hair-2 disabled:opacity-50"
      >
        {pending ? "Synchro…" : "Synchroniser Fleetbase"}
      </button>
      {result && (
        <span className={`text-[13px] ${result.ok ? "text-success" : "text-danger-ink"}`}>
          {syncMessage(result)}
        </span>
      )}
    </div>
  );
}
