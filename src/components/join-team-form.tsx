import { useTranslations } from "next-intl";
import { PhoneField } from "@/components/phone-field";
import { joinTeam } from "@/lib/actions/join";

const input =
  "h-12 w-full rounded-[10px] border border-hair bg-white px-3.5 text-[15px] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15";

/**
 * The join form. A server component — nothing here needs the client, and
 * PhoneField brings its own "use client" for the input it owns.
 *
 * The token rides as a hidden field rather than living in the action's
 * closure: joinTeam re-reads the invite from it anyway, so there is nothing
 * to protect, and this keeps the action a plain form handler.
 */
export function JoinTeamForm({ token }: { token: string }) {
  const t = useTranslations("Join");

  return (
    <form action={joinTeam} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      <Field label={t("name")}>
        <input name="name" placeholder={t("namePlaceholder")} required className={input} />
      </Field>
      <Field label={t("phone")}>
        <PhoneField name="phone" size="lg" required />
        <span id="phone-hint" className="text-[12px] text-stone-muted">
          {t("phoneHint")}
        </span>
      </Field>
      <Field label={t("email")}>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          required
          className={input}
        />
      </Field>
      <Field label={t("password")}>
        <input
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
          className={input}
        />
      </Field>

      <button
        type="submit"
        className="mt-1 h-12 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        {t("submit")}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-stone-muted2">{label}</span>
      {children}
    </label>
  );
}
