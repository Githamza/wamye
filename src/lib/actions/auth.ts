"use server";

import { sendPasswordResetEmail } from "@/lib/auth/approval-email";

/**
 * "Mot de passe oublié" — send the recovery email server-side. Always
 * resolves, whether or not the address has an account: the form must not
 * reveal which emails exist.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return;
  await sendPasswordResetEmail(cleaned);
}
