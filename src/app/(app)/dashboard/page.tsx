import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDinar } from "@/lib/format";
import { stageLabel } from "@/lib/labels";
import { ShopLink } from "@/components/shop-link";
import { NavigatorConnectButton } from "@/components/navigator-connect-button";
import { getTenantFleetbaseContext } from "@/lib/tenant";
import {
  buildNavigatorDeepLinks,
  NAVIGATOR_APP_STORE_URL,
  NAVIGATOR_PLAY_URL,
} from "@/lib/navigator-link";

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

const storeLink =
  "flex h-9 items-center rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2";

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white">
        {number}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="text-[14px] font-medium text-stone-ink">{title}</div>
        {children}
      </div>
    </li>
  );
}

export default async function OrdersPage() {
  const profile = await requireTenant();
  setRequestLocale(profile.locale);
  const t = await getTranslations("Dashboard");

  const supabase = await createClient();
  const [{ data }, { data: tenant }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, fleetbase_id, stage, status, commerce_name, order_text, phone, fee, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("tenants").select("slug").eq("id", profile.tenantId).maybeSingle(),
  ]);

  const orders = (data ?? []) as OrderRow[];

  // The configure deep link for step 3 — the driver taps it right here and
  // Navigator points itself at this tenant's instance. Null until the
  // admin has stored the tenant's Fleetbase key.
  const ctx = tenant?.slug ? await getTenantFleetbaseContext(tenant.slug) : null;
  const navigatorLinks = ctx ? buildNavigatorDeepLinks(ctx) : null;

  return (
    <div className="flex flex-col gap-4">
      {tenant?.slug && <ShopLink slug={tenant.slug} />}

      {/* Getting started — always expanded by default; the reader can still
          collapse it for the session. */}
      <details open className="group rounded-[14px] border border-hair bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-[14px] font-semibold text-stone-ink [&::-webkit-details-marker]:hidden">
          {t("start.title")}
          <span className="text-[12px] text-stone-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <ol className="flex flex-col gap-5 border-t border-hair p-4">
          <Step number={1} title={t("start.shareTitle")}>
            <p className="text-[13px] leading-relaxed text-stone-muted">
              {t("start.shareBody")}
            </p>
          </Step>

          <Step number={2} title={t("start.appTitle")}>
            <p className="text-[13px] leading-relaxed text-stone-muted">
              {t("start.appBody")}
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <a
                href={NAVIGATOR_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={storeLink}
              >
                {t("start.playStore")}
              </a>
              <a
                href={NAVIGATOR_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={storeLink}
              >
                {t("start.appStore")}
              </a>
            </div>
            {/* Screen captures of the Navigator app slot in here. */}
          </Step>

          <Step number={3} title={t("start.connectTitle")}>
            <p className="text-[13px] leading-relaxed text-stone-muted">
              {t("start.connectBody")}
            </p>
            {navigatorLinks ? (
              <NavigatorConnectButton
                iosLink={navigatorLinks.ios}
                androidLink={navigatorLinks.android}
              />
            ) : (
              <p className="text-[13px] text-stone-muted2">{t("sync.noKey")}</p>
            )}
          </Step>
        </ol>
      </details>

      <h1 className="text-lg font-semibold text-stone-ink">{t("orders.title")}</h1>

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
                  {o.stage ? stageLabel(o.stage, profile.locale) : o.status ?? "—"}
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
