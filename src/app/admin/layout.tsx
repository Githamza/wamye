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
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
