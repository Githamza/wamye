import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
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

  return <LoginForm next={next} />;
}
