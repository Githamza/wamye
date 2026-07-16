import type { Metadata } from "next";
import Link from "next/link";
import { isOpenNowIn, TUNISIA_TZ } from "@/lib/hours";
import { listPublicTenants } from "@/lib/tenant";

// The directory tracks tenant approvals and opening hours, so it is resolved
// per request rather than baked at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wamya — Livraison en Tunisie",
  description:
    "Trouvez un livreur près de chez vous. Repas, courses, pharmacie : un livreur confirme le prix avant achat, vous payez à la livraison.",
};

const STEPS = [
  {
    icon: "🛍️",
    title: "Choisissez un commerce",
    body: "Restaurant, épicerie, pâtisserie ou pharmacie — dites simplement ce qu'il vous faut.",
  },
  {
    icon: "💬",
    title: "Le livreur confirme le prix",
    body: "Il vérifie la disponibilité et vous annonce le total avant d'acheter. Aucune surprise.",
  },
  {
    icon: "🛵",
    title: "Payez à la livraison",
    body: "Vous réglez en espèces à l'arrivée, à votre porte.",
  },
];

export default async function LandingPage() {
  const tenants = await listPublicTenants();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-6 sm:py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-fill text-[18px]">
            🛵
          </span>
          <span className="text-[17px] font-bold tracking-tight text-stone-ink">
            Wamya
          </span>
        </div>
        <Link
          href="/login"
          className="rounded-[10px] border border-hair bg-white px-3.5 py-2 text-[13px] font-medium text-stone-muted2 transition-colors hover:bg-hair-2"
        >
          Espace livreur
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="text-[30px] leading-[1.15] font-extrabold tracking-tight text-stone-ink sm:text-[38px]">
          Tout ce qu&apos;il vous faut,
          <br />
          livré près de chez vous.
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-stone-muted">
          Wamya réunit les services de livraison de Tunisie. Repas, courses,
          pharmacie : un livreur de votre région s&apos;en charge, confirme le
          prix avant d&apos;acheter, et vous payez à la livraison.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-stone-ink">
            Livreurs disponibles
          </h2>
          {tenants.length > 0 && (
            <span className="text-[13px] text-stone-muted">
              {tenants.length} {tenants.length > 1 ? "régions" : "région"}
            </span>
          )}
        </div>

        {tenants.length === 0 ? (
          <div className="rounded-[12px] border border-hair bg-white px-4 py-8 text-center">
            <p className="text-[14px] text-stone-muted">
              Aucun livreur n&apos;est disponible pour le moment.
            </p>
            <p className="mt-1 text-[13px] text-stone-faint">
              Revenez bientôt — de nouvelles régions arrivent.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {tenants.map((t) => {
              const open = isOpenNowIn(t.hours, TUNISIA_TZ);
              return (
                <li key={t.slug}>
                  <Link
                    href={`/t/${t.slug}`}
                    className="flex h-full items-center gap-3.5 rounded-[14px] border border-hair bg-white p-4 transition-colors hover:border-brand-border hover:bg-brand-bg"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-fill text-[20px]">
                      {t.branding.logoEmoji ?? "🛵"}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[15px] font-semibold text-stone-ink">
                        {t.branding.name || t.name}
                      </span>
                      <span className="flex items-center gap-2 text-[12.5px] text-stone-muted">
                        {t.branding.areaLabel && (
                          <span className="truncate">{t.branding.areaLabel}</span>
                        )}
                        <span
                          className={`flex flex-none items-center gap-1 ${
                            open ? "text-success" : "text-stone-faint"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              open ? "bg-success" : "bg-stone-faint"
                            }`}
                          />
                          {open ? "Ouvert" : "Fermé"}
                        </span>
                      </span>
                    </div>
                    <span className="flex-none text-[18px] text-stone-faint">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">
          Comment ça marche
        </h2>
        <ul className="grid gap-2.5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.title}
              className="flex flex-col gap-1.5 rounded-[14px] border border-hair bg-white p-4"
            >
              <span className="text-[22px]">{s.icon}</span>
              <span className="text-[14px] font-semibold text-stone-ink">
                {s.title}
              </span>
              <span className="text-[13px] leading-relaxed text-stone-muted">
                {s.body}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-[14px] border border-brand-border bg-brand-bg p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-brand-ink">
            Vous êtes livreur ?
          </h2>
          <p className="text-[13px] leading-relaxed text-brand-ink/75">
            Inscrivez votre service, couvrez votre région et recevez vos
            commandes sur Wamya.
          </p>
        </div>
        <Link
          href="/signup"
          className="flex-none rounded-[10px] bg-brand px-4 py-2.5 text-center text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Créer un compte
        </Link>
      </section>

      <footer className="border-t border-hair pt-5 text-[12.5px] text-stone-faint">
        Wamya — livraison en Tunisie.
      </footer>
    </div>
  );
}
