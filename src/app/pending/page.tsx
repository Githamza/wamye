import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const profile = await requireTenant();
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, status")
    .eq("id", profile.tenantId)
    .maybeSingle();

  // Already approved → send them to the real dashboard.
  if (tenant?.status === "active") redirect("/dashboard");

  const suspended = tenant?.status === "suspended";

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 p-6 text-center">
      <div className="text-4xl">{suspended ? "🚫" : "⏳"}</div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-stone-ink">
          {suspended ? "Compte suspendu" : "Compte en attente de validation"}
        </h1>
        <p className="text-[14px] leading-relaxed text-stone-muted">
          {suspended
            ? "Votre compte a été suspendu. Contactez l'administrateur pour le réactiver."
            : `Merci ${tenant?.name ?? ""} ! Votre inscription a bien été reçue. Un administrateur va valider votre compte et configurer la livraison. Vous pourrez alors accéder à votre tableau de bord.`}
        </p>
      </div>

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="h-11 rounded-[10px] border border-hair bg-white px-5 text-[14px] font-medium text-stone-muted2 transition-colors hover:bg-hair-2"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
