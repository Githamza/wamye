import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { DriverValue } from "@/components/driver-value";
import { getSessionUser } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  // Only allow same-site relative redirects to avoid an open-redirect.
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  // Already signed in → skip the form.
  if (await getSessionUser()) redirect(next);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col justify-center gap-10 p-6 lg:flex-row lg:items-center lg:gap-16">
      {/* Value panel — why a driver signs up / signs in. */}
      <section className="flex flex-1 flex-col gap-4">
        <Link href="/" className="flex w-fit items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-fill text-[18px]">
            🛵
          </span>
          <span className="text-[17px] font-bold tracking-tight text-stone-ink">Wamye</span>
        </Link>
        <div className="flex flex-col gap-2">
          <h2 className="text-[26px] leading-[1.15] font-extrabold tracking-tight text-stone-ink sm:text-[30px]">
            Développez votre activité de livraison.
          </h2>
          <p className="max-w-md text-[14px] leading-relaxed text-stone-muted">
            Wamye connecte votre service aux clients de votre région. Connectez-vous pour
            gérer vos commandes — ou créez un compte en quelques secondes.
          </p>
        </div>
        <DriverValue />
      </section>

      {/* Form panel. */}
      <div className="w-full lg:max-w-sm lg:flex-1">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
