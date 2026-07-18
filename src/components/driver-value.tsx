// Shared "why register as a driver" benefits list, used by both the login and
// signup pages. The driver surface is French-primary (like the rest of the
// (app) group), so the copy is not translated.

const BENEFITS = [
  { icon: "📦", text: "Recevez vos commandes directement sur votre tableau de bord." },
  { icon: "🔗", text: "Votre page de commande à partager avec vos clients." },
  { icon: "🗺️", text: "Couvrez la zone de votre choix et fixez vos frais de livraison." },
  { icon: "💵", text: "Paiement à la livraison — le prix est confirmé avant chaque achat." },
] as const;

export function DriverValue({ className = "" }: { className?: string }) {
  return (
    <ul
      className={`flex flex-col gap-2.5 rounded-[12px] border border-brand-border bg-brand-bg p-4 ${className}`}
    >
      {BENEFITS.map((benefit) => (
        <li key={benefit.text} className="flex items-start gap-2.5">
          <span className="text-[15px] leading-tight" aria-hidden>
            {benefit.icon}
          </span>
          <span className="text-[13px] leading-relaxed text-brand-ink/80">{benefit.text}</span>
        </li>
      ))}
    </ul>
  );
}
