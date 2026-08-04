import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("super_admin");

  return (
    <div className="min-h-[100dvh] bg-app">
      <header className="flex items-center justify-between border-b border-hair bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛰️</span>
          <div className="text-[15px] font-semibold text-stone-ink">Wamye — Admin plateforme</div>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <Link href="/admin/carte" className="text-stone-muted2 hover:text-brand">
            Carte
          </Link>
          <Link href="/dashboard" className="text-stone-muted2 hover:text-brand">
            Mon tableau de bord
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-[8px] border border-hair px-3 py-1.5 font-medium text-stone-muted2 hover:bg-hair-2"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      {/* No width cap here: each page sets its own. The tenant pages are forms,
          which read badly past 3xl; the national map wants the whole screen. */}
      <main className="w-full p-4 sm:p-6">{children}</main>
    </div>
  );
}
