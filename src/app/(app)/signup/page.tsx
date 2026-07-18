import Link from "next/link";
import { DriverValue } from "@/components/driver-value";
import { signupDriver } from "@/lib/actions/signup";

export const dynamic = "force-dynamic";

const input =
  "h-12 w-full rounded-[10px] border border-hair bg-white px-3.5 text-[15px] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15";

const ERRORS: Record<string, string> = {
  missing: "Nom, email et mot de passe (8 caractères min) sont obligatoires.",
  email: "Cet email est déjà utilisé.",
  insert: "Échec de la création — réessayez.",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-stone-muted2">{label}</span>
      {children}
    </label>
  );
}

export default async function SignupPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await props.searchParams;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-stone-ink">Créer un compte livreur</h1>
        <p className="text-[14px] text-stone-muted">
          Inscrivez votre service de livraison et recevez vos commandes en ligne. Votre compte
          sera activé après validation.
        </p>
      </div>

      <DriverValue />

      {error && (
        <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-[13px] text-danger-ink">
          {ERRORS[error] ?? "Erreur."}
        </div>
      )}

      <form action={signupDriver} className="flex flex-col gap-3">
        <Field label="Nom du service">
          <input name="name" placeholder="Livraison Express" required className={input} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" placeholder="vous@exemple.com" required className={input} />
        </Field>
        <Field label="Mot de passe (8 caractères min)">
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
            className={input}
          />
        </Field>
        <Field label="Téléphone (optionnel)">
          <input name="supportPhone" placeholder="+216…" className={input} />
        </Field>
        <Field label="Zone desservie (optionnel)">
          <input name="areaLabel" placeholder="Sfax centre" className={input} />
        </Field>

        <button
          type="submit"
          className="mt-1 h-12 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Créer mon compte
        </button>
      </form>

      <Link
        href="/login"
        className="self-center text-[13px] text-brand underline underline-offset-[3px]"
      >
        J&apos;ai déjà un compte
      </Link>
    </div>
  );
}
