import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";

export const dynamic = "force-dynamic";

// ownerOnly hides a tab from sub-drivers. Cosmetic only — requireOwner() inside
// each of those pages is the actual gate.
const NAV = [
  { href: "/dashboard", label: "Commandes" },
  { href: "/dashboard/stats", label: "Statistiques", ownerOnly: true },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/team", label: "Équipe", ownerOnly: true },
  { href: "/dashboard/settings", label: "Réglages", ownerOnly: true },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireTenant();

  // Two independent gates. The member gate is checked first because a pending
  // sub-driver's current_tenant_id() is null, so the tenant read below would
  // return nothing anyway and the reason for the bounce would be misleading.
  if (profile.status !== "active") redirect("/pending");

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, status")
    .eq("id", profile.tenantId)
    .maybeSingle();

  // Pending/suspended drivers can't use the dashboard until a super-admin
  // approves them (and connects their Fleetbase).
  if (tenant?.status !== "active") redirect("/pending");

  const nav = NAV.filter((n) => !n.ownerOnly || profile.isOwner);

  return (
    <div className="min-h-[100dvh] bg-app">
      <header className="flex items-center justify-between border-b border-hair bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛵</span>
          <div className="text-[15px] font-semibold text-stone-ink">
            {tenant?.name ?? "Tableau de bord"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[13px] text-stone-muted sm:inline">
            {profile.name ?? profile.role}
          </span>
          <DashboardLocaleSwitcher current={profile.locale} />
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
        {nav.map((n) => (
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
