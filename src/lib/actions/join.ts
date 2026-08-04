"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { allow } from "@/lib/rate-limit";
import { countInviteUse, lookupInvite } from "@/lib/invites";
import { sendJoinRequestEmail } from "@/lib/auth/approval-email";

/**
 * A driver joining a team through an invitation link.
 *
 * The mirror image of addSubDriver, which this replaces: the driver types
 * their own password, and the owner — not a super-admin — decides. Everything
 * that determines WHICH team is read back from the invite server-side; the
 * form contributes identity only.
 */
export async function joinTeam(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  // `return back(...)` rather than a bare call: redirect() throws, but the
  // explicit return is what lets both the reader and the compiler see that
  // nothing below runs.
  const back = (error: string): never =>
    redirect(`/rejoindre/${token}?error=${error}`);

  // Two shapes of abuse to blunt: someone hammering one link, and someone
  // sweeping tokens from one address. Fails open (see rate-limit.ts).
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await allow(`join:ip:${ip}`, 10, "1 hour"))) return back("throttled");
  if (!(await allow(`join:token:${token}`, 20, "1 hour"))) return back("throttled");

  // The invite is the authority on tenant_id and parent_profile_id. Nothing
  // from the browser is trusted to say which team is being joined.
  const lookup = await lookupInvite(token);
  if (!lookup.ok) return back("invite");
  const { invite } = lookup;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  // Stored as the 8 local digits, like every other number we keep.
  const phone = normalizePhone(String(formData.get("phone") ?? ""));

  if (!name || !email || password.length < 8) return back("missing");
  if (!isValidPhone(phone)) return back("phone");

  const supabase = createAdminClient();

  const { data: created, error: uErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  // Almost always "already registered". One profile carries one tenant_id, so
  // an existing account cannot be folded into a team here — the page says so.
  if (uErr || !created?.user) return back("email");
  const userId = created.user.id;

  const { error: pErr } = await supabase.from("profiles").insert({
    id: userId,
    tenant_id: invite.tenantId,
    role: "tenant_admin",
    name,
    phone,
    email,
    // The invite's owner, not a form field: this is what makes them a member
    // of THIS team rather than a second owner of it.
    parent_profile_id: invite.createdBy,
    status: "pending",
    joined_via_invite: invite.id,
  });
  if (pErr) {
    // Roll back the orphaned login so a retry with the same email is clean.
    await supabase.auth.admin.deleteUser(userId);
    return back("insert");
  }

  await countInviteUse(invite.id, invite.uses);

  // Tell the owner someone is waiting. Best effort: the request is already on
  // their team page, the mail only shortens the wait.
  const { data: owner } = await supabase.auth.admin.getUserById(invite.createdBy);
  if (owner?.user?.email) {
    await sendJoinRequestEmail(owner.user.email, { name, phone });
  }

  // Unlike addSubDriver — which deliberately did NOT sign in, because it ran
  // inside the owner's session — this IS the new member's own browser. Signing
  // them in puts them straight on /pending with a real session to come back to.
  const session = await createClient();
  await session.auth.signInWithPassword({ email, password });

  redirect("/pending?joined=1");
}
