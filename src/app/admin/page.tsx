import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { toggleTenantActive } from "@/lib/actions/tenants";

export const dynamic = "force-dynamic";

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export default async function AdminHomePage(props: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireRole("super_admin");
  const { created } = await props.searchParams;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, slug, name, is_active, created_at")
    .order("created_at", { ascending: false });
  const tenants = (data ?? []) as TenantRow[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-stone-ink">Tenants</h1>
        <Link
          href="/admin/tenants/new"
          className="rounded-[10px] bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          + Nouveau tenant
        </Link>
      </div>

      {created && (
        <div className="rounded-[10px] border border-brand-border bg-brand-bg px-4 py-2.5 text-[13px] text-brand-ink">
          Tenant « {created} » créé. Partagez le lien /login + « Mot de passe oublié » avec son
          admin pour qu&apos;il définisse son mot de passe.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {tenants.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-[12px] border border-hair bg-white p-3.5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium text-stone-ink">{t.name}</span>
                {!t.is_active && (
                  <span className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-stone-muted2">
                    inactif
                  </span>
                )}
              </div>
              <Link
                href={`/t/${t.slug}`}
                className="text-[13px] text-brand underline underline-offset-2"
              >
                /t/{t.slug}
              </Link>
            </div>
            <form action={toggleTenantActive}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="active" value={String(t.is_active)} />
              <button
                type="submit"
                className="rounded-[8px] border border-hair px-3 py-1.5 text-[13px] text-stone-muted2 hover:bg-hair-2"
              >
                {t.is_active ? "Désactiver" : "Activer"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
