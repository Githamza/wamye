"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/** Add a commerce to the current tenant's list. */
export async function addCommerce(formData: FormData) {
  const profile = await requireTenant();
  const name = String(formData.get("name") ?? "").trim();
  const addr = String(formData.get("addr") ?? "").trim();
  if (!name || !addr) return;

  const supabase = await createClient();
  await supabase
    .from("commerces")
    .insert({ tenant_id: profile.tenantId, name, addr });
  revalidatePath("/dashboard/commerces");
}

/** Remove a commerce. RLS restricts the delete to the caller's tenant. */
export async function deleteCommerce(formData: FormData) {
  await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("commerces").delete().eq("id", id);
  revalidatePath("/dashboard/commerces");
}
