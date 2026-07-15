import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { addCommerce, deleteCommerce } from "@/lib/actions/commerces";

export const dynamic = "force-dynamic";

type CommerceRow = {
  id: string;
  name: string;
  addr: string;
  lat: number | null;
  lng: number | null;
};

export default async function CommercesPage() {
  await requireTenant();
  const supabase = await createClient();
  const { data } = await supabase
    .from("commerces")
    .select("id, name, addr, lat, lng")
    .order("name");

  const commerces = (data ?? []) as CommerceRow[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-stone-ink">Commerces</h1>

      <form
        action={addCommerce}
        className="flex flex-col gap-2 rounded-[14px] border border-hair bg-white p-4"
      >
        <div className="text-[13px] font-semibold text-stone-muted">Ajouter un commerce</div>
        <input
          name="name"
          placeholder="Nom (ex : Chez Ali)"
          required
          className="h-11 rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
        />
        <input
          name="addr"
          placeholder="Adresse"
          required
          className="h-11 rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="h-11 self-start rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          Ajouter
        </button>
      </form>

      {commerces.length === 0 ? (
        <div className="rounded-[14px] border border-hair bg-white p-8 text-center text-[14px] text-stone-muted">
          Aucun commerce. Ajoutez-en un ci-dessus.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {commerces.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-[12px] border border-hair bg-white p-3.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="text-[14px] font-medium text-stone-ink">{c.name}</div>
                <div className="truncate text-[13px] text-stone-muted">{c.addr}</div>
              </div>
              {c.lat != null && (
                <span className="flex-none rounded-full bg-hair-2 px-2 py-0.5 text-[11px] text-stone-muted2">
                  📍 GPS
                </span>
              )}
              <form action={deleteCommerce}>
                <input type="hidden" name="id" value={c.id} />
                <button
                  type="submit"
                  className="flex-none rounded-[8px] px-2 py-1 text-[13px] text-stone-muted transition-colors hover:bg-danger-bg hover:text-danger-ink"
                >
                  Retirer
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
