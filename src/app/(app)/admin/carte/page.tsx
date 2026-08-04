import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { loadCoverage } from "@/lib/coverage-data";
import { CoverageBoard } from "@/components/admin/coverage-board";

export const dynamic = "force-dynamic";

/**
 * Where the livreurs are, nationally — the view a launch-by-city decision is
 * made on. Read-only by design: nothing here validates or suspends anyone, that
 * stays on the livreur's own page.
 */
export default async function AdminCoveragePage() {
  await requireRole("super_admin");
  const livreurs = await loadCoverage();

  return (
    // dir="ltr" because every string on this page is French, and the (app)
    // layout sets the document direction from the VIEWER's locale — an ar-TN
    // super-admin was reading a right-aligned French page with its numbers and
    // phone numbers mirrored.
    <div dir="ltr" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold text-stone-ink">Carte des livreurs</h1>
          <p className="text-[13px] text-stone-muted">
            Où se situent les livreurs inscrits, par gouvernorat — pour ouvrir
            ville par ville.
          </p>
        </div>
        <Link href="/admin" className="text-[13px] text-brand hover:underline">
          Liste des livreurs
        </Link>
      </div>

      <CoverageBoard livreurs={livreurs} />
    </div>
  );
}
