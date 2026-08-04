import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveTenant,
  toggleTenantActive,
  updateTenantFleetbase,
} from "@/lib/actions/tenants";
import { approveSubDriver, setMemberStatus } from "@/lib/actions/team";
import { statusLabel } from "@/lib/labels";
import { TestConnectionButton } from "@/components/test-connection-button";
import { ProvisionTenantButton } from "@/components/provision-tenant-button";
import { isFleetbaseAdminConfigured } from "@/lib/fleetbase-admin";

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

// The codes the actions can put in ?done=; anything else falls back.
const DONE_MESSAGE: Record<string, string> = {
  fleetbase: "Connexion Fleetbase enregistrée.",
  approved: "Compte validé, organisation Fleetbase créée et livreur enregistré.",
  "approved-no-fleetbase":
    "Compte validé, mais la création de l'organisation Fleetbase a échoué — réessayez ci-dessous.",
  activated: "Compte réactivé.",
  suspended: "Compte suspendu.",
  "member-approved": "Livreur validé.",
  "member-activated": "Livreur réactivé.",
  "member-suspended": "Livreur suspendu.",
};

type TeamRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  parent_profile_id: string | null;
};

export default async function TenantDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requireRole("super_admin");
  const { id } = await props.params;
  const { done, error } = await props.searchParams;
  const doneMessage = done ? (DONE_MESSAGE[done] ?? "Modifications enregistrées.") : null;

  const supabase = createAdminClient();
  const { data: t } = await supabase
    .from("tenants")
    .select("id, slug, name, status, is_active, fleetbase_api_url, fleetbase_order_type")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const { data: secret } = await supabase
    .from("tenant_secrets")
    .select("tenant_id")
    .eq("tenant_id", id)
    .maybeSingle();
  const hasKey = Boolean(secret);
  // With admin credentials on hand, approval creates the Fleetbase company and
  // its key by itself — there is nothing to connect by hand beforehand.
  const autoProvision = isFleetbaseAdminConfigured();

  // The whole team: the owner (parent_profile_id null) plus their sub-drivers.
  const { data: teamRows } = await supabase
    .from("profiles")
    .select("id, name, phone, status, parent_profile_id, role")
    .eq("tenant_id", id)
    .neq("role", "super_admin")
    .order("parent_profile_id", { nullsFirst: true })
    .order("created_at");
  const team = (teamRows ?? []) as TeamRow[];

  // The instance-wide identity probe that used to run here is gone with the
  // driver records it protected: nothing files a person into Fleetbase any
  // more, so there is no 422 left to pre-empt.

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-[13px] text-stone-muted">
        <Link href="/admin" className="text-brand hover:underline">
          Tenants
        </Link>
        <span>/</span>
        <span>{t.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-stone-ink">{t.name}</h1>
          <span className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-stone-muted2">
            {statusLabel(t.status)}
          </span>
        </div>
        <Link href={`/t/${t.slug}`} className="text-[13px] text-brand underline underline-offset-2">
          /t/{t.slug}
        </Link>
      </div>

      {doneMessage && (
        <div className="rounded-[10px] border border-brand-border bg-brand-bg px-4 py-2.5 text-[13px] text-brand-ink">
          {doneMessage}
        </div>
      )}
      {error && (
        <div className="rounded-[10px] border border-hair bg-white px-4 py-2.5 text-[13px] text-danger-ink">
          L&apos;enregistrement a échoué. Réessayez.
        </div>
      )}

      {/* APPROVAL */}
      {t.status === "pending" && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-5">
          <div className="text-[14px] font-semibold text-stone-ink">Validation</div>
          <p className="text-[13px] text-stone-muted">
            {hasKey || !autoProvision
              ? "Connectez d'abord Fleetbase ci-dessous, puis validez ce compte pour lui donner accès à son tableau de bord et activer sa page publique."
              : "La validation crée l'organisation Fleetbase, génère sa clé API, ouvre son rayon de diffusion à la zone du compte et enregistre le livreur — puis active sa page publique."}
          </p>
          <form action={approveTenant}>
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              disabled={!hasKey && !autoProvision}
              className="h-11 rounded-[10px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-hair disabled:text-stone-faint"
            >
              {hasKey || autoProvision ? "Valider ce compte" : "Connectez Fleetbase d'abord"}
            </button>
          </form>
        </div>
      )}

      {/* TEAM — the owner plus the drivers who joined through their invitation
          link. Accepting a request is the owner's job now; the button here is
          the override for when they are unreachable. */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-5">
        <div className="text-[14px] font-semibold text-stone-ink">Équipe</div>
        <p className="text-[13px] text-stone-muted">
          Les livreurs rejoignent cette équipe par le lien d&apos;invitation du
          responsable, qui valide lui-même les demandes.
        </p>

        {team.length === 0 && (
          <div className="text-[13px] text-stone-muted">Aucun compte.</div>
        )}

        {team.map((m) => {
          const isOwner = m.parent_profile_id === null;
          return (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-[10px] border border-hair p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-medium text-stone-ink">
                    {m.name ?? "—"}{" "}
                    <span className="text-[12px] text-stone-muted">
                      {isOwner ? "· responsable" : "· sous-livreur"}
                    </span>
                  </div>
                  <div className="text-[12px] text-stone-muted">
                    {m.phone || "aucun numéro"}
                  </div>
                </div>
                <span className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-stone-muted2">
                  {statusLabel(m.status)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {m.status === "pending" && (
                  <form action={approveSubDriver}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="tenantId" value={t.id} />
                    <button
                      type="submit"
                      className="h-9 rounded-[8px] bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover"
                    >
                      Valider
                    </button>
                  </form>
                )}
                {!isOwner && m.status !== "pending" && (
                  <form action={setMemberStatus}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="tenantId" value={t.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={m.status === "active" ? "suspended" : "active"}
                    />
                    <button
                      type="submit"
                      className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-muted2 hover:bg-hair-2"
                    >
                      {m.status === "active" ? "Suspendre" : "Réactiver"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FLEETBASE — one card, and the automation leads. The manual key entry
          stays available but folded away: it is the escape hatch (attaching a
          company that already exists, or one this instance did not create),
          not the normal path. */}
      <div className="flex flex-col gap-4 rounded-[14px] border border-hair bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-semibold text-stone-ink">
            Fleetbase (dispatch livreurs)
          </div>
          <span className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-stone-muted2">
            {hasKey ? "Organisation connectée" : "Aucune organisation"}
          </span>
        </div>

        {hasKey ? (
          <div className="flex flex-wrap items-center gap-3">
            <TestConnectionButton tenantId={t.id} />
          </div>
        ) : autoProvision ? (
          <>
            <p className="text-[13px] text-stone-muted">
              La validation du compte crée l&apos;organisation et sa clé toute seule. Ce
              bouton ne sert qu&apos;à rattraper un échec, ou un compte validé avant
              l&apos;automatisation.
            </p>
            <ProvisionTenantButton tenantId={t.id} />
          </>
        ) : (
          <p className="text-[13px] text-stone-muted">
            Identifiants admin Fleetbase absents du serveur : la clé doit être saisie à la
            main ci-dessous.
          </p>
        )}

        <details className="border-t border-hair pt-3">
          <summary className="cursor-pointer text-[13px] text-stone-muted2 hover:text-stone-ink">
            Saisie manuelle {hasKey ? "(remplacer la clé, changer l'URL)" : "(clé d'une organisation existante)"}
          </summary>
          <form action={updateTenantFleetbase} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="id" value={t.id} />
            <Field label="URL de l'API">
              <input name="apiUrl" defaultValue={t.fleetbase_api_url ?? ""} className={input} />
            </Field>
            <Field label="Order type">
              <input name="orderType" defaultValue={t.fleetbase_order_type ?? ""} className={input} />
            </Field>
            <Field
              label={hasKey ? "Clé API (enregistrée — laisser vide pour conserver)" : "Clé API"}
            >
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={hasKey ? "•••••••••• (inchangée)" : "flb_live_…"}
                className={input}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="h-11 rounded-[10px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
              >
                Enregistrer
              </button>
              {!hasKey && <TestConnectionButton tenantId={t.id} />}
            </div>
          </form>
        </details>
      </div>

      {/* ACTIVE TOGGLE (post-approval) */}
      {t.status !== "pending" && (
        <form action={toggleTenantActive} className="self-start">
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="active" value={String(t.is_active)} />
          <button
            type="submit"
            className="h-10 rounded-[10px] border border-hair bg-white px-4 text-[13px] text-stone-muted2 hover:bg-hair-2"
          >
            {t.is_active ? "Suspendre ce compte" : "Réactiver ce compte"}
          </button>
        </form>
      )}
    </div>
  );
}
