"use client";

import { useState, useTransition } from "react";
import { testTenantConnection, type TestResult } from "@/lib/actions/tenants";

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
          {result.message}
        </span>
      )}
    </div>
  );
}
