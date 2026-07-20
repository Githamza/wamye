import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOwner } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  addSubDriver,
  removeSubDriver,
  toggleSubDriverActive,
  updateOwnPhone,
} from "@/lib/actions/team";
import { statusLabel } from "@/lib/labels";
import { navigatorConnectUrl } from "@/lib/navigator-link";
import { SyncDriverButton } from "@/components/sync-driver-button";
import { NavigatorShareActions } from "@/components/navigator-share";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  fleetbase_driver_id: string | null;
};

const input =
  "h-11 w-full rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand";

// The keys the action can put in ?error=; anything else falls back.
const ERROR_KEY: Record<string, string> = {
  missing: "errorMissing",
  email: "errorEmail",
  insert: "errorInsert",
  forbidden: "errorForbidden",
  pending: "errorPending",
};

export default async function TeamPage(props: {
  searchParams: Promise<{ added?: string; error?: string }>;
}) {
  const owner = await requireOwner();
  setRequestLocale(owner.locale);
  const t = await getTranslations("Dashboard.team");
  const tNav = await getTranslations("Dashboard.navigator");
  const { added, error } = await props.searchParams;

  const supabase = await createClient();
  // RLS (profiles_select_team) scopes this to the caller's tenant; the parent
  // filter narrows it to this owner's sub-drivers specifically.
  const { data } = await supabase
    .from("profiles")
    .select("id, name, phone, status, fleetbase_driver_id")
    .eq("parent_profile_id", owner.id)
    .order("created_at");

  const members = (data ?? []) as MemberRow[];

  const { data: me } = await supabase
    .from("profiles")
    .select("id, name, phone, status, fleetbase_driver_id")
    .eq("id", owner.id)
    .maybeSingle();
  const self = me as MemberRow | null;

  // The tenant's Navigator connection link (minted on first visit) — what a
  // driver opens on their phone to get the app installed and configured.
  // The QR is for the cross-device case: page on a laptop, driver's phone in
  // hand. Generated server-side; the data URL carries no secret beyond the
  // link itself.
  const connectUrl = await navigatorConnectUrl(owner.tenantId);
  const connectQr = connectUrl
    ? await QRCode.toDataURL(connectUrl, { margin: 1, width: 220 })
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-stone-ink">{t("title")}</h1>
        <p className="text-[13px] leading-relaxed text-stone-muted">{t("intro")}</p>
      </div>

      {added && (
        <div className="rounded-[10px] border border-hair bg-white p-3 text-[13px] text-success">
          {t("added")}
        </div>
      )}
      {error && (
        <div className="rounded-[10px] border border-hair bg-white p-3 text-[13px] text-danger-ink">
          {t(ERROR_KEY[error] ?? "errorFallback")}
        </div>
      )}

      {/* You. Your own Fleetbase driver record is what puts you in the pool
          alongside your team. */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-medium text-stone-ink">
              {self?.name ?? owner.name}{" "}
              <span className="text-stone-muted">{t("you")}</span>
            </div>
            <div className="text-[13px] text-stone-muted">
              {self?.phone || t("noPhone")}
            </div>
          </div>
          <SyncDriverButton
            profileId={owner.id}
            synced={Boolean(self?.fleetbase_driver_id)}
          />
        </div>
        {!self?.phone && (
          <form action={updateOwnPhone} className="flex gap-2">
            <input
              name="phone"
              placeholder={t("phonePlaceholder")}
              required
              className={input}
            />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-[10px] bg-brand px-4 text-[14px] font-medium text-white"
            >
              {t("savePhone")}
            </button>
          </form>
        )}
      </div>

      {/* The tenant's Navigator connection link. One link for the whole
          team — it configures the app for this tenant, then each driver
          signs in with their own phone number. */}
      {connectUrl && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4">
          <div className="text-[13px] font-semibold text-stone-muted">
            {tNav("title")}
          </div>
          <p className="text-[13px] leading-relaxed text-stone-muted">{tNav("hint")}</p>
          <NavigatorShareActions url={connectUrl} />
          {connectQr && (
            <div className="flex items-center gap-3 border-t border-hair pt-3">
              {/* Data-URL QR; next/image has nothing to optimize here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={connectQr}
                alt=""
                className="size-[110px] flex-none rounded-[8px] border border-hair"
              />
              <p className="text-[12px] leading-relaxed text-stone-muted">
                {tNav("qrHint")}
              </p>
            </div>
          )}
        </div>
      )}

      <form
        action={addSubDriver}
        className="flex flex-col gap-2 rounded-[14px] border border-hair bg-white p-4"
      >
        <div className="text-[13px] font-semibold text-stone-muted">{t("addTitle")}</div>
        <input name="name" placeholder={t("namePlaceholder")} required className={input} />
        <input
          name="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          required
          className={input}
        />
        <input
          name="phone"
          placeholder={t("memberPhonePlaceholder")}
          required
          className={input}
        />
        <input
          name="password"
          type="password"
          placeholder={t("passwordPlaceholder")}
          minLength={8}
          required
          className={input}
        />
        <button
          type="submit"
          className="h-11 rounded-[10px] bg-brand text-[14px] font-medium text-white"
        >
          {t("add")}
        </button>
        <p className="text-[12px] leading-relaxed text-stone-muted">{t("addHint")}</p>
      </form>

      <div className="flex flex-col gap-2">
        {members.length === 0 && (
          <div className="rounded-[14px] border border-hair bg-white p-4 text-[14px] text-stone-muted">
            {t("empty")}
          </div>
        )}
        {members.map((m) => (
          <div
            key={m.id}
            className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-medium text-stone-ink">{m.name}</div>
                <div className="text-[13px] text-stone-muted">{m.phone}</div>
              </div>
              <span className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-stone-muted2">
                {statusLabel(m.status, owner.locale)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SyncDriverButton
                profileId={m.id}
                synced={Boolean(m.fleetbase_driver_id)}
              />
              {m.status !== "pending" && (
                <form action={toggleSubDriverActive}>
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-muted2 hover:bg-hair-2"
                  >
                    {m.status === "active" ? t("suspend") : t("reactivate")}
                  </button>
                </form>
              )}
              <form action={removeSubDriver}>
                <input type="hidden" name="id" value={m.id} />
                <button
                  type="submit"
                  className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-danger-ink hover:bg-hair-2"
                >
                  {t("remove")}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
