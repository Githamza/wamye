import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  phone: string;
  name: string | null;
  last_repere: string | null;
  created_at: string;
};

export default async function ClientsPage() {
  await requireTenant();
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, phone, name, last_repere, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const clients = (data ?? []) as ClientRow[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-stone-ink">Clients</h1>

      {clients.length === 0 ? (
        <div className="rounded-[14px] border border-hair bg-white p-8 text-center text-[14px] text-stone-muted">
          Aucun client pour le moment. Ils apparaissent dès la première commande.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {clients.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-[12px] border border-hair bg-white p-3.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="text-[14px] font-medium text-stone-ink">
                  {c.name || "Client"}
                </div>
                <div className="text-[13px] text-stone-muted">+216 {formatPhone(c.phone)}</div>
              </div>
              {c.last_repere && (
                <div className="max-w-[45%] truncate text-[12px] text-stone-muted">
                  {c.last_repere}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
