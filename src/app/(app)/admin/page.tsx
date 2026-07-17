import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  is_active: boolean;
  created_at: string;
};

/** Badge colours only — the label itself comes from @/lib/labels, which the
 *  fr/ar-TN split translates and these class names must not follow. */
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-hair text-stone-muted2",
};

/** An unmodelled status still renders, in neutral grey. */
const STATUS_CLASS_FALLBACK = "bg-hair text-stone-muted2";

export default async function AdminHomePage(props: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireRole("super_admin");
  const { created } = await props.searchParams;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, slug, name, status, is_active, created_at")
    .order("created_at", { ascending: false });
  const tenants = (data ?? []) as TenantRow[];

  const { data: secrets } = await supabase.from("tenant_secrets").select("tenant_id");
  const connected = new Set((secrets ?? []).map((s) => s.tenant_id as string));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-stone-ink">Livreurs</h1>
        <Link
          href="/admin/tenants/new"
          className="rounded-[10px] bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          + Nouveau
        </Link>
      </div>

      {created && (
        <div className="rounded-[10px] border border-brand-border bg-brand-bg px-4 py-2.5 text-[13px] text-brand-ink">
          Livreur « {created} » créé.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {tenants.map((t) => {
          return (
            <li key={t.id}>
              <Link
                href={`/admin/tenants/${t.id}`}
                className="flex items-center gap-3 rounded-[12px] border border-hair bg-white p-3.5 transition-colors hover:bg-hair-2"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-stone-ink">{t.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        STATUS_CLASS[t.status] ?? STATUS_CLASS_FALLBACK
                      }`}
                    >
                      {statusLabel(t.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-stone-muted">
                    <span>/t/{t.slug}</span>
                    <span className={connected.has(t.id) ? "text-success" : "text-stone-faint"}>
                      {connected.has(t.id) ? "Fleetbase connecté" : "Fleetbase non connecté"}
                    </span>
                  </div>
                </div>
                <span className="text-[18px] text-stone-faint">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
