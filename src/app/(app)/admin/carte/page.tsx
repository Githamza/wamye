import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { loadCoverage } from "@/lib/coverage-data";
import { CoverageBoard } from "@/components/admin/coverage-board";

export const dynamic = "force-dynamic";

/**
 * Where the livreurs are, nationally — the view a launch-by-city decision is
 * made on, and the one place a whole city's accounts can be validated in a row.
 */
export default async function AdminCoveragePage(props: {
  searchParams: Promise<{ gov?: string; done?: string; error?: string }>;
}) {
  await requireRole("super_admin");
  const { gov, done, error } = await props.searchParams;
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

      {done === "approved" && (
        <div className="rounded-[10px] border border-brand-border bg-brand-bg px-4 py-2.5 text-[13px] text-brand-ink">
          Compte validé — son tableau de bord et sa page publique sont ouverts,
          et il en est prévenu par email.
        </div>
      )}
      {error && (
        <div className="rounded-[10px] border border-hair bg-white px-4 py-2.5 text-[13px] text-danger-ink">
          La validation a échoué. Réessayez.
        </div>
      )}

      <CoverageBoard livreurs={livreurs} initialGovKey={gov ?? null} />
    </div>
  );
}
