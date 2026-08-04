import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { ShareActions } from "@/components/share-actions";
import { regenerateInvite } from "@/lib/actions/team";
import { getOrCreateTeamInvite, inviteUrl } from "@/lib/invites";

/**
 * The team's invitation: link, QR, and the code for when the whole exchange
 * happens over the phone.
 *
 * The QR is for the cross-device case — page open on a laptop, the driver's
 * phone in hand. Generated server-side as a data URL; it carries no secret
 * beyond the link itself.
 */
export async function InviteCard({
  tenantId,
  ownerId,
}: {
  tenantId: string;
  ownerId: string;
}) {
  const t = await getTranslations("Dashboard.invite");
  const invite = await getOrCreateTeamInvite(tenantId, ownerId);
  if (!invite) return null;

  const url = await inviteUrl(invite.token);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4">
      <div className="text-[13px] font-semibold text-stone-muted">{t("title")}</div>
      <p className="text-[13px] leading-relaxed text-stone-muted">{t("hint")}</p>

      <div className="truncate rounded-[10px] border border-hair bg-hair-2 px-3 py-2 font-mono text-[12px] text-stone-muted2">
        {url}
      </div>
      <ShareActions url={url} />

      <div className="flex items-center gap-3 border-t border-hair pt-3">
        {/* Data-URL QR; next/image has nothing to optimize here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt=""
          className="size-[110px] flex-none rounded-[8px] border border-hair"
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] leading-relaxed text-stone-muted">{t("qrHint")}</p>
          <div className="text-[12px] text-stone-muted">
            {t("codeLabel")}{" "}
            <span className="font-mono text-[15px] font-semibold tracking-[0.15em] text-stone-ink">
              {invite.code}
            </span>
          </div>
        </div>
      </div>

      <form action={regenerateInvite} className="border-t border-hair pt-3">
        <button
          type="submit"
          className="h-9 rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-muted2 hover:bg-hair-2"
        >
          {t("regenerate")}
        </button>
        <p className="mt-1.5 text-[12px] leading-relaxed text-stone-muted">
          {t("regenerateHint")}
        </p>
      </form>
    </div>
  );
}
