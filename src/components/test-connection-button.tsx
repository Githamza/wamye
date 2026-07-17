"use client";

import { useState, useTransition } from "react";
import { testTenantConnection, type TestCode, type TestResult } from "@/lib/actions/tenants";

/** The wording lives here, not in the action: this component knows the reader. */
const TEST_MESSAGE: Record<TestCode, string> = {
  connected: "Connexion réussie ✓",
  "no-key": "Aucune clé Fleetbase configurée.",
  "fleetbase-error": "Échec de la connexion.",
  failed: "Échec de la connexion.",
};

function testMessage(result: NonNullable<TestResult>): string {
  // Fleetbase's own status and text are more useful than a generic failure.
  if (result.detail) {
    return `Échec (${result.detail.status}) : ${result.detail.message}`;
  }
  return TEST_MESSAGE[result.code];
}

export function TestConnectionButton({ tenantId }: { tenantId: string }) {
  const [result, setResult] = useState<TestResult>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await testTenantConnection(tenantId)))}
        className="h-10 rounded-[10px] border border-hair bg-white px-4 text-[14px] font-medium text-stone-ink hover:bg-hair-2 disabled:opacity-50"
      >
        {pending ? "Test…" : "Tester la connexion"}
      </button>
      {result && (
        <span className={`text-[13px] ${result.ok ? "text-success" : "text-danger-ink"}`}>
          {testMessage(result)}
        </span>
      )}
    </div>
  );
}
