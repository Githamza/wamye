import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Commandes" },
  { href: "/dashboard/stats", label: "Statistiques" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/commerces", label: "Commerces" },
  { href: "/dashboard/settings", label: "Réglages" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireTenant();
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, status")
    .eq("id", profile.tenantId)
    .maybeSingle();

  // Pending/suspended drivers can't use the dashboard until a super-admin
  // approves them (and connects their Fleetbase).
  if (tenant?.status !== "active") redirect("/pending");

  return (
    <div className="min-h-[100dvh] bg-app">
      <header className="flex items-center justify-between border-b border-hair bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛵</span>
          <div className="text-[15px] font-semibold text-stone-ink">
            {tenant?.name ?? "Tableau de bord"}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-[13px] text-stone-muted sm:inline">
            {profile.name ?? profile.role}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-[8px] border border-hair px-3 py-1.5 text-[13px] font-medium text-stone-muted2 transition-colors hover:bg-hair-2"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-hair bg-white px-3">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="whitespace-nowrap px-3 py-2.5 text-[14px] font-medium text-stone-muted2 hover:text-brand"
          >
            {n.label}
          </Link>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
