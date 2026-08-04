import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDinar } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { stateLabel } from "@/lib/labels";

/**
 * One customer and everything they ever ordered. The clients list answers
 * "who buys from me"; this answers "how often, and for how much".
 */

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  state: string | null;
  commerce_name: string | null;
  order_text: string | null;
  fee: number | null;
  created_at: string;
};

function dateFormat(locale: string) {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-TN" : locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ClientDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const profile = await requireTenant();
  setRequestLocale(profile.locale);
  const t = await getTranslations("Dashboard");

  const supabase = await createClient();
  // RLS scopes both reads to the tenant, so an id from another business
  // simply returns nothing and 404s.
  const { data: client } = await supabase
    .from("clients")
    .select("id, phone, name, last_repere, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();

  // Orders written before the clients table existed — and any whose client
  // upsert failed — carry the phone but no client_id, so match on either.
  const { data } = await supabase
    .from("orders")
    .select("id, state, commerce_name, order_text, fee, created_at")
    .or(`client_id.eq.${id},phone.eq.${client.phone as string}`)
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = (data ?? []) as OrderRow[];
  const total = orders.reduce((sum, o) => sum + (o.fee ?? 0), 0);
  const when = dateFormat(profile.locale);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/clients"
        className="flex items-center gap-1.5 text-[13px] text-stone-muted"
      >
        <span className="inline-block rtl:rotate-180">‹</span>
        {t("clients.back")}
      </Link>

      <div className="flex flex-col gap-1 rounded-[14px] border border-hair bg-white p-4">
        <div className="text-[16px] font-semibold text-stone-ink">
          {(client.name as string | null) || t("clients.fallbackName")}
        </div>
        <a
          dir="ltr"
          href={`tel:+216${client.phone as string}`}
          className="self-start text-[14px] text-stone-muted"
        >
          +216 {formatPhone(client.phone as string)}
        </a>
        {(client.last_repere as string | null) && (
          <div className="text-[13px] text-stone-muted">
            {client.last_repere as string}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-3 text-[13px] text-stone-muted2">
          <span>{t("clients.orderCount", { count: orders.length })}</span>
          {total > 0 && (
            <span>
              {t("clients.totalSpent", {
                amount: formatDinar(total, profile.locale),
              })}
            </span>
          )}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-[14px] border border-hair bg-white p-8 text-center text-[14px] text-stone-muted">
          {t("clients.ordersEmpty")}
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
                  {[o.commerce_name, when.format(new Date(o.created_at))]
                    .filter(Boolean)
                    .join(" · ")}
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
