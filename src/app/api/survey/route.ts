import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPhone, normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const SITUATIONS = ["deja_livreur", "bientot"] as const;
const EXPERIENCES = ["moins_2ans", "plus_2ans"] as const;

type Body = {
  situation: (typeof SITUATIONS)[number];
  experience: (typeof EXPERIENCES)[number] | null;
  creeContenu: boolean;
  compteSocial: string;
  zones: string;
  phone: string;
};

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseBody(b: unknown): Body | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;

  const situation = o.situation;
  if (!SITUATIONS.includes(situation as Body["situation"])) return null;

  // L'expérience n'a de sens que pour un livreur en activité.
  let experience: Body["experience"] = null;
  if (situation === "deja_livreur") {
    if (!EXPERIENCES.includes(o.experience as (typeof EXPERIENCES)[number])) {
      return null;
    }
    experience = o.experience as Body["experience"];
  }

  const phone = clean(o.phone, 20);
  if (!isValidPhone(phone)) return null;

  return {
    situation: situation as Body["situation"],
    experience,
    creeContenu: o.creeContenu === true,
    compteSocial: clean(o.compteSocial, 120),
    zones: clean(o.zones, 300),
    phone: normalizePhone(phone),
  };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("survey_responses").insert({
    situation: body.situation,
    experience: body.experience,
    cree_contenu: body.creeContenu,
    compte_social: body.compteSocial || null,
    zones: body.zones || null,
    phone: body.phone,
  });

  if (error) {
    // 23505 : le numéro a déjà répondu (contrainte unique sur phone).
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    console.error("[survey] insert failed:", error.message);
    return NextResponse.json({ error: "insert" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
