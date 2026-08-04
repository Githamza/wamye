import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireTenant } from "@/lib/auth/dal";
import { loadCrew } from "@/lib/crew-data";
import { CrewList } from "@/components/team/crew-list";

/**
 * Who is on shift, and on what.
 *
 * Open to every member, not just the owner: /dashboard/team is the owner's
 * staffing screen (approve, suspend, invite), this is the shift view a driver
 * checks before deciding whether to take a second course or leave it for
 * someone closer.
 */

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const profile = await requireTenant();
  setRequestLocale(profile.locale);
  const t = await getTranslations("Dashboard.crew");

  const crew = await loadCrew(profile.tenantId, profile.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-[13px] font-medium text-brand underline underline-offset-2"
        >
          {t("back")}
        </Link>
        <p className="text-[13px] text-stone-muted">{t("intro")}</p>
      </div>

      <CrewList
        crew={crew}
        tenantId={profile.tenantId}
        profileId={profile.id}
      />
    </div>
  );
}
