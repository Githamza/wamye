import { requireOwner } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  addSubDriver,
  removeSubDriver,
  toggleSubDriverActive,
  updateOwnPhone,
} from "@/lib/actions/team";
import { SyncDriverButton } from "@/components/sync-driver-button";

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

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  active: "Actif",
  suspended: "Suspendu",
};

const ERROR_LABEL: Record<string, string> = {
  missing: "Nom, e-mail, téléphone et un mot de passe d'au moins 8 caractères sont requis.",
  email: "Cet e-mail est déjà utilisé.",
  insert: "Impossible de créer le livreur. Réessayez.",
  forbidden: "Ce livreur ne fait pas partie de votre équipe.",
  pending: "Ce livreur attend encore la validation d'un administrateur.",
};

export default async function TeamPage(props: {
  searchParams: Promise<{ added?: string; error?: string }>;
}) {
  const owner = await requireOwner();
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-stone-ink">Équipe</h1>

      {added && (
        <div className="rounded-[10px] border border-hair bg-white p-3 text-[13px] text-success">
          Livreur ajouté ✓ Un administrateur doit valider son compte avant qu&apos;il
          puisse recevoir des livraisons.
        </div>
      )}
      {error && (
        <div className="rounded-[10px] border border-hair bg-white p-3 text-[13px] text-danger-ink">
          {ERROR_LABEL[error] ?? "Une erreur est survenue."}
        </div>
      )}

      {/* You. Your own Fleetbase driver record is what puts you in the pool
          alongside your team. */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-medium text-stone-ink">
              {self?.name ?? owner.name} <span className="text-stone-muted">(vous)</span>
            </div>
            <div className="text-[13px] text-stone-muted">
              {self?.phone || "Aucun numéro — requis pour Fleetbase"}
            </div>
          </div>
          <SyncDriverButton
            profileId={owner.id}
            synced={Boolean(self?.fleetbase_driver_id)}
          />
        </div>
        {!self?.phone && (
          <form action={updateOwnPhone} className="flex gap-2">
            <input name="phone" placeholder="Votre numéro" required className={input} />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-[10px] bg-brand px-4 text-[14px] font-medium text-white"
            >
              Enregistrer
            </button>
          </form>
        )}
      </div>

      <form
        action={addSubDriver}
        className="flex flex-col gap-2 rounded-[14px] border border-hair bg-white p-4"
      >
        <div className="text-[13px] font-semibold text-stone-muted">
          Ajouter un livreur à votre équipe
        </div>
        <input name="name" placeholder="Nom complet" required className={input} />
        <input
          name="email"
          type="email"
          placeholder="E-mail (servira d'identifiant)"
          required
          className={input}
        />
        <input name="phone" placeholder="Téléphone" required className={input} />
        <input
          name="password"
          type="password"
          placeholder="Mot de passe provisoire (8 caractères min.)"
          minLength={8}
          required
          className={input}
        />
        <button
          type="submit"
          className="h-11 rounded-[10px] bg-brand text-[14px] font-medium text-white"
        >
          Ajouter
        </button>
        <p className="text-[12px] leading-relaxed text-stone-muted">
          Communiquez-lui cet e-mail et ce mot de passe. Il pourra se connecter
          immédiatement, mais ne recevra des livraisons qu&apos;une fois validé par un
          administrateur — et seulement s&apos;il est en ligne dans l&apos;application
          Fleetbase Navigator, qui partage sa position.
        </p>
      </form>

      <div className="flex flex-col gap-2">
        {members.length === 0 && (
          <div className="rounded-[14px] border border-hair bg-white p-4 text-[14px] text-stone-muted">
            Aucun livreur dans votre équipe pour l&apos;instant.
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
                {STATUS_LABEL[m.status] ?? m.status}
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
                    {m.status === "active" ? "Suspendre" : "Réactiver"}
                  </button>
                </form>
              )}
              <form action={removeSubDriver}>
                <input type="hidden" name="id" value={m.id} />
                <button
                  type="submit"
                  className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-danger-ink hover:bg-hair-2"
                >
                  Retirer
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
