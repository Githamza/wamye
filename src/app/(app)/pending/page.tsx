import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const profile = await requireTenant();
  const supabase = await createClient();
  // Null for a pending sub-driver: their current_tenant_id() is null by design,
  // so tenants_select yields nothing. The copy below must not depend on it.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, status")
    .eq("id", profile.tenantId)
    .maybeSingle();

  // Must mirror BOTH of the dashboard layout's gates. Redirecting on the tenant
  // gate alone would bounce an approved-business/pending-member pair between
  // /dashboard and /pending forever.
  if (tenant?.status === "active" && profile.status === "active") {
    redirect("/dashboard");
  }

  const suspended =
    profile.status === "suspended" || tenant?.status === "suspended";

  // A sub-driver waits on their own approval; an owner waits on their business's.
  const title = suspended
    ? "Compte suspendu"
    : "Compte en attente de validation";

  let body: string;
  if (suspended) {
    body = profile.isOwner
      ? "Votre compte a été suspendu. Contactez l'administrateur pour le réactiver."
      : "Votre accès a été suspendu. Contactez votre responsable ou l'administrateur.";
  } else if (profile.isOwner) {
    // The tenant row is not always readable here (see the query note above), so
    // the name has to be optional rather than interpolated blind — it used to
    // render "Merci  !" with a hole in it.
    const thanks = tenant?.name ? `Merci ${tenant.name} !` : "Merci !";
    body = `${thanks} Votre inscription a bien été reçue. Un administrateur va valider votre compte et configurer la livraison. Vous pourrez alors accéder à votre tableau de bord.`;
  } else {
    body =
      "Votre responsable vous a ajouté à son équipe. Un administrateur doit encore valider votre compte avant que vous puissiez recevoir des livraisons.";
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 p-6 text-center">
      <div className="text-4xl">{suspended ? "🚫" : "⏳"}</div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-stone-ink">{title}</h1>
        <p className="text-[14px] leading-relaxed text-stone-muted">{body}</p>
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
