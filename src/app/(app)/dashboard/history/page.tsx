import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDinar } from "@/lib/format";
import { stateLabel } from "@/lib/labels";

/**
 * Past courses. This is the list that used to sit on /dashboard; the home page
 * now belongs to the live feed, which is what a driver opens the app for.
 */

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  state: string | null;
  commerce_name: string | null;
  order_text: string | null;
  phone: string | null;
  fee: number | null;
  created_at: string;
};

export default async function HistoryPage() {
  const profile = await requireTenant();
  setRequestLocale(profile.locale);
  const t = await getTranslations("Dashboard");

  const supabase = await createClient();
  // RLS scopes this to the tenant — no explicit .eq("tenant_id") needed.
  const { data } = await supabase
    .from("orders")
    .select("id, state, commerce_name, order_text, phone, fee, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const orders = (data ?? []) as OrderRow[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-[15px] font-semibold text-stone-ink">{t("orders.title")}</h1>

      {orders.length === 0 ? (
        <div className="rounded-[14px] border border-hair bg-white p-8 text-center text-[14px] text-stone-muted">
          {t("orders.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-3 rounded-[12px] border border-hair bg-white p-3.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-[14px] font-medium text-stone-ink">
                  {o.order_text ?? "—"}
                </div>
                <div className="truncate text-[13px] text-stone-muted">
                  {o.commerce_name} · {o.phone}
                </div>
              </div>
              <div className="flex flex-none flex-col items-end gap-0.5">
                <span className="rounded-full bg-hair-2 px-2.5 py-1 text-[12px] font-medium text-stone-muted2">
                  {stateLabel(o.state, profile.locale)}
                </span>
                {o.fee != null && (
                  <span className="text-[12px] text-stone-muted">
                    {formatDinar(o.fee, profile.locale)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
