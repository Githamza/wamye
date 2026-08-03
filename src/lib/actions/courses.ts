"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { OrderState } from "@/lib/order-status";
import { isDeclineReason, requiresNote } from "@/lib/decline-reasons";

/**
 * Driver-side course actions.
 *
 * Every one of these is a thin wrapper over a SECURITY DEFINER function from
 * migration 0015. That is not indirection for its own sake: migration 0014 took
 * write access to `orders` away from the browser entirely, so those functions
 * are the only path — and the only place a legal state-machine edge, or the
 * first-to-accept-wins guarantee, is expressed.
 *
 * They run through the user's cookie-bound client, never the admin one: the
 * functions read auth.uid() to decide who the caller is.
 *
 * Server Actions rather than route handlers, deliberately. Next dispatches them
 * one at a time per client, so a double-tap on "Accepter" — or a tap on two
 * cards at once — cannot race; combined with accept_order's atomic UPDATE,
 * double-accept is impossible at both layers. They also get the framework's
 * Origin/Host check for free, and revalidatePath() means the response already
 * carries the refreshed feed.
 */

/**
 * How an action ended. A code, not a sentence: a server action has no locale,
 * so returning French from here would pin the UI to French whatever the reader
 * asked for. Same convention as SyncCode in @/lib/actions/team.
 */
export type CourseCode =
  | "ok"
  /** A reason was required and none came through. */
  | "reason-missing"
  /** Someone else got there first. The normal outcome of losing the race —
   *  render it as a toast, not an error. */
  | "already-taken"
  /** The order is no longer where the button thought it was (stale screen). */
  | "bad-transition"
  | "forbidden"
  | "failed";

export type CourseResult = { ok: boolean; code: CourseCode };

function classify(message: string | undefined): CourseCode {
  if (!message) return "failed";
  if (message.includes("already-taken")) return "already-taken";
  if (message.includes("bad-transition")) return "bad-transition";
  if (message.includes("forbidden")) return "forbidden";
  return "failed";
}

function refresh(): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/history");
}

/** Take a pending course. Atomic — see accept_order() in migration 0015. */
export async function acceptCourse(orderId: string): Promise<CourseResult> {
  await requireTenant();
  const supabase = await createClient();

  const { error } = await supabase.rpc("accept_order", { p_order_id: orderId });
  if (error) return { ok: false, code: classify(error.message) };

  refresh();
  return { ok: true, code: "ok" };
}

/**
 * Turn a course down, with a reason.
 *
 * Hides it for this driver only — the course stays in every other member's
 * feed. The reason is the payload that matters: "trop loin" fifty times is a
 * dispatch-radius problem, "prix trop bas" is a pricing problem.
 */
export async function declineCourse(
  orderId: string,
  reason: string,
  note?: string,
): Promise<CourseResult> {
  await requireTenant();

  if (!isDeclineReason(reason)) return { ok: false, code: "reason-missing" };
  const trimmed = note?.trim() ?? "";
  // "Autre" without a word written is just a refusal we cannot learn from.
  if (requiresNote(reason) && trimmed === "") {
    return { ok: false, code: "reason-missing" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_course", {
    p_order_id: orderId,
    p_reason: reason,
    p_note: trimmed || null,
  });
  if (error) return { ok: false, code: classify(error.message) };

  refresh();
  return { ok: true, code: "ok" };
}

async function advance(
  orderId: string,
  to: OrderState,
  opts: { note?: string | null; proofPath?: string | null } = {},
): Promise<CourseResult> {
  await requireTenant();
  const supabase = await createClient();

  const { error } = await supabase.rpc("advance_order", {
    p_order_id: orderId,
    p_to: to,
    p_note: opts.note ?? null,
    p_proof: opts.proofPath ?? null,
  });
  if (error) return { ok: false, code: classify(error.message) };

  refresh();
  return { ok: true, code: "ok" };
}

/** The driver has the package in hand. */
export async function markPickedUp(orderId: string): Promise<CourseResult> {
  return advance(orderId, "picked_up");
}

/**
 * Delivered. `proofPath` is the object the browser has already uploaded to the
 * delivery-proofs bucket — optional, and never blocking: a driver in a hurry or
 * on a bad connection still gets to close the course.
 */
export async function markDelivered(
  orderId: string,
  proofPath?: string | null,
): Promise<CourseResult> {
  return advance(orderId, "delivered", { proofPath });
}

/** Something went wrong mid-course; the note is for the tenant, not the customer. */
export async function reportProblem(
  orderId: string,
  note: string,
): Promise<CourseResult> {
  return advance(orderId, "problem", { note: note.trim() || null });
}

/** The driver gives the course back. Terminal — it does not return to the pool. */
export async function cancelCourse(
  orderId: string,
  note?: string,
): Promise<CourseResult> {
  return advance(orderId, "canceled", { note: note?.trim() || null });
}
