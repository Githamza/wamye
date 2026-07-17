import { requireOwner } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDinar, formatKm } from "@/lib/format";
import { stageLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

type Row = {
  fee: number | null;
  distance_km: number | null;
  stage: string | null;
  status: string | null;
  created_at: string;
};

const WINDOW_DAYS = 90;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-hair bg-white p-4">
      <span className="text-[12px] font-medium text-stone-muted">{label}</span>
      <span className="text-[22px] font-semibold text-stone-ink">{value}</span>
    </div>
  );
}

export default async function StatsPage() {
  await requireOwner();
  const supabase = await createClient();

  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data } = await supabase
    .from("orders")
    .select("fee, distance_km, stage, status, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];

  const now = Date.now();
  const in7 = (r: Row) => now - new Date(r.created_at).getTime() <= 7 * 86400_000;
  const in30 = (r: Row) => now - new Date(r.created_at).getTime() <= 30 * 86400_000;

  const total = rows.length;
  const last7 = rows.filter(in7).length;
  const last30 = rows.filter(in30).length;
  const revenue = rows.reduce((s, r) => s + (r.fee ?? 0), 0);
  const distances = rows.filter((r) => r.distance_km != null);
  const avgDistance =
    distances.length > 0
      ? distances.reduce((s, r) => s + (r.distance_km ?? 0), 0) / distances.length
      : 0;

  // Breakdown by stage (fall back to status when stage is null).
  const byStage = new Map<string, number>();
  for (const r of rows) {
    const key = r.stage ?? r.status ?? "—";
    byStage.set(key, (byStage.get(key) ?? 0) + 1);
  }
  const breakdown = [...byStage.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = breakdown.reduce((m, [, c]) => Math.max(m, c), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-stone-ink">Statistiques</h1>
        <p className="text-[13px] text-stone-muted">Sur les {WINDOW_DAYS} derniers jours.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Commandes (total)" value={String(total)} />
        <Stat label="7 derniers jours" value={String(last7)} />
        <Stat label="30 derniers jours" value={String(last30)} />
        <Stat label="Revenus (frais)" value={formatDinar(revenue)} />
        <Stat label="Distance moyenne" value={formatKm(avgDistance)} />
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-5">
        <div className="text-[14px] font-semibold text-stone-ink">Répartition par statut</div>
        {breakdown.length === 0 ? (
          <p className="text-[14px] text-stone-muted">Aucune commande pour le moment.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {breakdown.map(([stage, count]) => (
              <li key={stage} className="flex items-center gap-3">
                <span className="w-32 flex-none text-[13px] text-stone-muted2">
                  {stageLabel(stage)}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-hair-2">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-8 flex-none text-right text-[13px] font-medium text-stone-ink">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
