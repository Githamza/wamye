import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/phone";

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

const NOTIFY_EMAIL = "hamza.haddad.dev@gmail.com";

const SITUATION_LABELS: Record<Body["situation"], string> = {
  deja_livreur: "Travaille déjà comme livreur",
  bientot: "Veut se lancer bientôt",
};

const EXPERIENCE_LABELS: Record<NonNullable<Body["experience"]>, string> = {
  moins_2ans: "moins de 2 ans",
  plus_2ans: "plus de 2 ans",
};

// Best-effort : une réponse au sondage ne doit jamais échouer parce que
// l'alerte email a échoué — on logge et on avale toute erreur.
async function sendResponseAlert(body: Body): Promise<void> {
  try {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.error("[survey] BREVO_API_KEY missing — no alert sent");
      return;
    }

    const lines = [
      `Situation : ${SITUATION_LABELS[body.situation]}`,
      body.experience && `Expérience : ${EXPERIENCE_LABELS[body.experience]}`,
      `Crée du contenu : ${body.creeContenu ? "oui" : "non"}`,
      body.compteSocial && `Compte : ${body.compteSocial}`,
      body.zones && `Zone(s) : ${body.zones}`,
      `Téléphone : ${formatPhone(body.phone)}`,
    ].filter(Boolean) as string[];

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Wamye Sondage",
          // Fallback sur le domaine authentifié — un expéditeur non validé
          // (ex. gmail) est accepté par l'API puis rejeté à l'envoi.
          email: process.env.BREVO_SENDER_EMAIL ?? "admin.wamye@mylabs.live",
        },
        to: [{ email: NOTIFY_EMAIL }],
        subject: `📋 Sondage — nouvelle réponse (${formatPhone(body.phone)})`,
        textContent: `Nouvelle réponse au sondage livreurs :\n\n${lines.join("\n")}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[survey] alert email failed:", (err as Error).message);
  }
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

  // Attendu (pas de fire-and-forget) : la réponse HTTP ne part qu'une fois
  // l'alerte tentée, sinon le runtime peut couper la requête avant l'envoi.
  await sendResponseAlert(body);

  return NextResponse.json({ ok: true });
}
