import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDT } from "@/lib/fees";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  fleetbase_id: string | null;
  stage: string | null;
  status: string | null;
  commerce_name: string | null;
  order_text: string | null;
  phone: string | null;
  fee: number | null;
  created_at: string;
};

const STAGE_LABEL: Record<string, string> = {
  searching: "Recherche livreur",
  enroute: "En route",
  delivered: "Livré",
  canceled: "Annulé",
};

export default async function OrdersPage() {
  await requireTenant();
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, fleetbase_id, stage, status, commerce_name, order_text, phone, fee, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const orders = (data ?? []) as OrderRow[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-stone-ink">Commandes</h1>

      {orders.length === 0 ? (
        <div className="rounded-[14px] border border-hair bg-white p-8 text-center text-[14px] text-stone-muted">
          Aucune commande pour le moment.
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
                  {o.stage ? STAGE_LABEL[o.stage] ?? o.stage : o.status ?? "—"}
                </span>
                {o.fee != null && (
                  <span className="text-[12px] text-stone-muted">{formatDT(o.fee)} DT</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
