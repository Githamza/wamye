import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOwner } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  approveTeamMember,
  rejectTeamMember,
  removeSubDriver,
  toggleSubDriverActive,
  updateOwnPhone,
} from "@/lib/actions/team";
import { statusLabel } from "@/lib/labels";
import { PhoneField } from "@/components/phone-field";
import { InviteCard } from "@/components/team/invite-card";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
};

const MEMBER_COLUMNS = "id, name, phone, status";

const ERROR_KEY: Record<string, string> = {
  phone: "errorPhone",
  forbidden: "errorForbidden",
  notPending: "errorNotPending",
};

const DONE_KEY: Record<string, string> = {
  approved: "doneApproved",
  rejected: "doneRejected",
  invite: "doneInvite",
};

export default async function TeamPage(props: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const owner = await requireOwner();
  setRequestLocale(owner.locale);
  const t = await getTranslations("Dashboard.team");
  const { done, error } = await props.searchParams;

  const supabase = await createClient();
  // RLS (profiles_select_team) scopes this to the caller's tenant; the parent
  // filter narrows it to this owner's own team specifically.
  const { data } = await supabase
    .from("profiles")
    .select(MEMBER_COLUMNS)
    .eq("parent_profile_id", owner.id)
    .order("created_at");

  const members = (data ?? []) as MemberRow[];
  // Split rather than filter twice: a join request is a different object to
  // the reader — something to answer, not something to manage.
  const requests = members.filter((m) => m.status === "pending");
  const roster = members.filter((m) => m.status !== "pending");

  const { data: me } = await supabase
    .from("profiles")
    .select(MEMBER_COLUMNS)
    .eq("id", owner.id)
    .maybeSingle();
  const self = me as MemberRow | null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-stone-ink">{t("title")}</h1>
        <p className="text-[13px] leading-relaxed text-stone-muted">{t("intro")}</p>
      </div>

      {done && (
        <div className="rounded-[10px] border border-hair bg-white p-3 text-[13px] text-success">
          {t(DONE_KEY[done] ?? "doneFallback")}
        </div>
      )}
      {error && (
        <div className="rounded-[10px] border border-hair bg-white p-3 text-[13px] text-danger-ink">
          {t(ERROR_KEY[error] ?? "errorFallback")}
        </div>
      )}

      {/* You. The boss rides too, so your own number has to be on file — it is
          what a customer's shop calls when the course is yours. */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4">
        <div>
          <div className="text-[15px] font-medium text-stone-ink">
            {self?.name ?? owner.name} <span className="text-stone-muted">{t("you")}</span>
          </div>
          <div className="text-[13px] text-stone-muted">
            {self?.phone || t("noPhone")}
          </div>
        </div>
        {!self?.phone && (
          <form action={updateOwnPhone} className="flex gap-2">
            <PhoneField name="phone" required />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-[10px] bg-brand px-4 text-[14px] font-medium text-white"
            >
              {t("savePhone")}
            </button>
          </form>
        )}
      </div>

      {/* JOIN REQUESTS — above the invitation on purpose: someone is waiting on
          an answer, and that outranks recruiting the next person. */}
      {requests.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-brand-border bg-brand-bg p-4">
          <div className="text-[13px] font-semibold text-brand-ink">
            {t("requestsTitle", { count: requests.length })}
          </div>
          {requests.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-hair bg-white p-3"
            >
              <div>
                <div className="text-[15px] font-medium text-stone-ink">{m.name}</div>
                <div className="text-[13px] text-stone-muted">{m.phone}</div>
              </div>
              <div className="flex items-center gap-2">
                <form action={approveTeamMember}>
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="h-9 rounded-[8px] bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover"
                  >
                    {t("accept")}
                  </button>
                </form>
                <form action={rejectTeamMember}>
                  <input type="hidden" name="id" value={m.id} />
                  <button
                    type="submit"
                    className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-danger-ink hover:bg-hair-2"
                  >
                    {t("refuse")}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <InviteCard tenantId={owner.tenantId} ownerId={owner.id} />

      <div className="flex flex-col gap-2">
        {roster.length === 0 && (
          <div className="rounded-[14px] border border-hair bg-white p-4 text-[14px] text-stone-muted">
            {t("empty")}
          </div>
        )}
        {roster.map((m) => (
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
              <form action={toggleSubDriverActive}>
                <input type="hidden" name="id" value={m.id} />
                <button
                  type="submit"
                  className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-muted2 hover:bg-hair-2"
                >
                  {m.status === "active" ? t("suspend") : t("reactivate")}
                </button>
              </form>
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
