import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOwner } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateGeneral } from "@/lib/actions/tenant-settings";
import { ZoneMapEditor } from "@/components/zone-map-editor";
import type { Branding, FeeConfig, Hours, Zone } from "@/lib/config-types";

export const dynamic = "force-dynamic";

const input =
  "h-11 w-full rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-stone-muted2">{label}</span>
      {children}
    </label>
  );
}

export default async function SettingsPage() {
  const profile = await requireOwner();
  setRequestLocale(profile.locale);
  const tr = await getTranslations("Dashboard.settings");
  const supabase = createAdminClient();

  const { data: t } = await supabase
    .from("tenants")
    .select("name, branding, zone, fee_config, hours")
    .eq("id", profile.tenantId)
    .maybeSingle();

  const branding = (t?.branding ?? {}) as Branding;
  const zone = (t?.zone ?? { centerLat: 0, centerLng: 0, radiusKm: 10 }) as Zone;
  const fee = (t?.fee_config ?? { baseFee: 0, feePerKm: 0, minFee: 0 }) as FeeConfig;
  const hours = (t?.hours ?? { openHour: 0, closeHour: 24, alwaysOpen: false }) as Hours;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-stone-ink">{tr("title")}</h1>

      {/* GENERAL */}
      <form
        action={updateGeneral}
        className="flex flex-col gap-4 rounded-[14px] border border-hair bg-white p-5"
      >
        <div className="text-[14px] font-semibold text-stone-ink">{tr("sectionGeneral")}</div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("name")}>
            <input name="name" defaultValue={branding.name ?? t?.name ?? ""} className={input} />
          </Field>
          <Field label={tr("logoEmoji")}>
            <input name="logoEmoji" defaultValue={branding.logoEmoji ?? ""} className={input} />
          </Field>
          <Field label={tr("areaLabel")}>
            <input name="areaLabel" defaultValue={branding.areaLabel ?? ""} className={input} />
          </Field>
          <Field label={tr("supportPhone")}>
            <input name="supportPhone" defaultValue={branding.supportPhone ?? ""} className={input} />
          </Field>
        </div>

        <ZoneMapEditor
          initialLat={zone.centerLat}
          initialLng={zone.centerLng}
          initialRadiusKm={zone.radiusKm}
        />

        <div className="grid grid-cols-3 gap-3">
          <Field label={tr("baseFee")}>
            <input name="baseFee" type="number" step="any" defaultValue={fee.baseFee} className={input} />
          </Field>
          <Field label={tr("feePerKm")}>
            <input name="feePerKm" type="number" step="any" defaultValue={fee.feePerKm} className={input} />
          </Field>
          <Field label={tr("minFee")}>
            <input name="minFee" type="number" step="any" defaultValue={fee.minFee} className={input} />
          </Field>
        </div>

        <div className="grid grid-cols-3 items-end gap-3">
          <Field label={tr("openHour")}>
            <input name="openHour" type="number" min="0" max="23" defaultValue={hours.openHour} className={input} />
          </Field>
          <Field label={tr("closeHour")}>
            <input name="closeHour" type="number" min="0" max="24" defaultValue={hours.closeHour} className={input} />
          </Field>
          <label className="flex h-11 items-center gap-2 text-[14px] text-stone-ink">
            <input name="alwaysOpen" type="checkbox" defaultChecked={hours.alwaysOpen} className="size-4" />
            {tr("alwaysOpen")}
          </label>
        </div>

        <button
          type="submit"
          className="h-11 self-start rounded-[10px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          {tr("save")}
        </button>
      </form>
    </div>
  );
}
