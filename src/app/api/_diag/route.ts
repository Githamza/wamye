import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Temporary endpoint to diagnose why account-ready emails fall back to the
// Supabase recovery template in production. Token-gated; DELETE once solved.
const TOKEN = "wamye-diag-h7k2m9qx4t";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("t") !== TOKEN) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const key = process.env.BREVO_API_KEY;
  const report: Record<string, unknown> = {
    brevoKey: key
      ? { present: true, length: key.length, prefix: key.slice(0, 9) }
      : { present: false },
    brevoSender: process.env.BREVO_SENDER_EMAIL ?? null,
    serviceRoleKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  if (key) {
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": key, accept: "application/json" },
      });
      report.brevoAccountCheck = {
        status: res.status,
        body: (await res.text()).slice(0, 300),
      };
    } catch (err) {
      report.brevoAccountCheck = { error: String(err) };
    }
  }

  return NextResponse.json(report);
}
