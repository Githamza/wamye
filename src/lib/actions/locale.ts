"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOCALE_COOKIE, hasLocale } from "@/i18n/locales";

/** A year: long enough that a reader sets this once and forgets it. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Save the language the caller reads the dashboard in.
 *
 * Writes through the service role rather than the user's own client because
 * profiles carries SELECT policies only — see the profiles_update_lockdown
 * migration. An RLS policy could scope an update to the caller's row but not
 * to a single column, so granting one would also hand every signed-in user
 * their own status, role and tenant_id; a pending sub-driver could approve
 * themselves. The service role is the narrow path, and this action is the gate:
 * it writes exactly one column, to exactly the caller's own row, never to an id
 * the form supplies.
 *
 * The cookie is set too, so /login keeps the same language after a sign-out —
 * there is no profile to read there.
 */
export async function setViewerLocale(formData: FormData) {
  const requested = String(formData.get("locale") ?? "");
  if (!hasLocale(requested)) return;

  (await cookies()).set(LOCALE_COOKIE, requested, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  // Signed out (the /login switcher): the cookie alone carries the choice.
  const profile = await getProfile();
  if (!profile) return;

  await createAdminClient()
    .from("profiles")
    .update({ locale: requested })
    .eq("id", profile.id);

  // Every dashboard page renders in this language, so none of them may keep a
  // cached copy in the old one.
  revalidatePath("/", "layout");
}
