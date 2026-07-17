import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createTenant } from "@/lib/actions/tenants";
import { ZoneMapEditor } from "@/components/zone-map-editor";

export const dynamic = "force-dynamic";

const input =
  "h-11 w-full rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-stone-muted2">{label}</span>
      {children}
    </label>
  );
}

const ERRORS: Record<string, string> = {
  missing: "Slug, nom et email admin sont obligatoires.",
  slug: "Ce slug est déjà pris.",
  insert: "Échec de la création — réessayez.",
};

export default async function NewTenantPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("super_admin");
  const { error } = await props.searchParams;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-[13px] text-stone-muted">
        <Link href="/admin" className="text-brand hover:underline">
          Tenants
        </Link>
        <span>/</span>
        <span>Nouveau</span>
      </div>
      <h1 className="text-lg font-semibold text-stone-ink">Nouveau tenant</h1>

      {error && (
        <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-[13px] text-danger-ink">
          {ERRORS[error] ?? "Erreur."}
        </div>
      )}

      <form action={createTenant} className="flex flex-col gap-5">
        {/* Identity */}
        <section className="flex flex-col gap-4 rounded-[14px] border border-hair bg-white p-5">
          <div className="text-[14px] font-semibold text-stone-ink">Identité</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slug (URL : /t/slug)">
              <input name="slug" placeholder="chez-ali" required className={input} />
            </Field>
            <Field label="Nom affiché">
              <input name="name" placeholder="Chez Ali Livraison" required className={input} />
            </Field>
            <Field label="Emoji logo">
              <input name="logoEmoji" placeholder="🛵" className={input} />
            </Field>
            <Field label="Zone (libellé)">
              <input name="areaLabel" placeholder="Sfax centre" className={input} />
            </Field>
            <Field label="Téléphone support">
              <input name="supportPhone" placeholder="+216…" className={input} />
            </Field>
            <Field label="Email de l'admin">
              <input name="adminEmail" type="email" placeholder="admin@…" required className={input} />
            </Field>
          </div>
        </section>

        {/* Zone + fees + hours */}
        <section className="flex flex-col gap-4 rounded-[14px] border border-hair bg-white p-5">
          <div className="text-[14px] font-semibold text-stone-ink">Zone, tarifs & horaires</div>
          <ZoneMapEditor initialLat={33.808} initialLng={10.995} initialRadiusKm={15} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Frais de base (DT)">
              <input name="baseFee" type="number" step="any" defaultValue={2.5} className={input} />
            </Field>
            <Field label="Frais / km">
              <input name="feePerKm" type="number" step="any" defaultValue={0.6} className={input} />
            </Field>
            <Field label="Frais min (DT)">
              <input name="minFee" type="number" step="any" defaultValue={3} className={input} />
            </Field>
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <Field label="Ouverture (h)">
              <input name="openHour" type="number" min="0" max="23" defaultValue={8} className={input} />
            </Field>
            <Field label="Fermeture (h)">
              <input name="closeHour" type="number" min="0" max="24" defaultValue={23} className={input} />
            </Field>
            <label className="flex h-11 items-center gap-2 text-[14px] text-stone-ink">
              <input name="alwaysOpen" type="checkbox" className="size-4" /> Toujours ouvert
            </label>
          </div>
        </section>

        {/* Fleetbase */}
        <section className="flex flex-col gap-4 rounded-[14px] border border-hair bg-white p-5">
          <div className="text-[14px] font-semibold text-stone-ink">Fleetbase (dispatch)</div>
          <Field label="URL de l'API">
            <input name="apiUrl" placeholder="http://…" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order type">
              <input name="orderType" defaultValue="storefront" className={input} />
            </Field>
            <Field label="Rayon diffusion (m)">
              <input name="adhocDistance" type="number" placeholder="30000" className={input} />
            </Field>
          </div>
          <Field label="Clé API (flb_live_…) — peut être ajoutée plus tard">
            <input name="apiKey" type="password" autoComplete="off" placeholder="flb_live_…" className={input} />
          </Field>
        </section>

        <button
          type="submit"
          className="h-12 self-start rounded-[10px] bg-brand px-6 text-[15px] font-semibold text-white hover:bg-brand-hover"
        >
          Créer le tenant
        </button>
      </form>
    </div>
  );
}
