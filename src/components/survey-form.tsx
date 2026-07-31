"use client";

// ============================================================
// Formulaire du sondage livreurs (/sondage), rédigé en derja.
// Champs conditionnels (expérience, compte social) → client component ;
// la réponse part en POST vers /api/survey.
// ============================================================

import { useState } from "react";
import { isValidPhone } from "@/lib/phone";

const input =
  "h-12 w-full rounded-[10px] border border-hair bg-white px-3.5 text-[15px] text-stone-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15";

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 w-full rounded-[10px] border px-4 py-3 text-start text-[15px] font-medium transition-colors ${
        selected
          ? "border-brand bg-brand-bg text-brand-ink ring-[3px] ring-brand/15"
          : "border-hair bg-white text-stone-ink hover:border-brand/40"
      }`}
    >
      {children}
    </button>
  );
}

function Question({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] font-semibold text-stone-ink">{label}</p>
      {children}
    </div>
  );
}

export function SurveyForm() {
  const [situation, setSituation] = useState<"deja_livreur" | "bientot" | null>(
    null
  );
  const [experience, setExperience] = useState<
    "moins_2ans" | "plus_2ans" | null
  >(null);
  const [creeContenu, setCreeContenu] = useState<boolean | null>(null);
  const [compteSocial, setCompteSocial] = useState("");
  const [zones, setZones] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[14px] border border-brand-border bg-brand-bg px-6 py-10 text-center">
        <span className="text-3xl">🙌</span>
        <p className="text-lg font-semibold text-brand-ink">
          يعيّشك! وصلتنا إجابتك
        </p>
        <p className="text-[14px] text-stone-muted">
          شكراً على وقتك، باش نتواصلو معاك قريب.
        </p>
      </div>
    );
  }

  async function submit() {
    if (!situation) return setError("قلنا شنية وضعيتك توّا 🙏");
    if (situation === "deja_livreur" && !experience)
      return setError("قدّاش عندك وانتي تخدم؟");
    if (creeContenu === null) return setError("جاوب على سؤال المحتوى 🎥");
    if (creeContenu && !compteSocial.trim())
      return setError("حطّ الكونت متاعك (انستا ولا تيك توك)");
    if (!zones.trim()) return setError("قلنا في أنا منطقة تخدم");
    if (!isValidPhone(phone))
      return setError("النمرة لازمها 8 أرقام وتبدا بـ 2، 4، 5 ولا 9");

    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation,
          experience: situation === "deja_livreur" ? experience : null,
          creeContenu,
          compteSocial: creeContenu ? compteSocial : "",
          zones,
          phone,
        }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const { error: code } = await res.json().catch(() => ({ error: "" }));
        setError(
          code === "duplicate"
            ? "النمرة هاذي جاوبت قبل 😉 يعيّشك"
            : "صار مشكل، عاود جرّب من فضلك"
        );
      }
    } catch {
      setError("صار مشكل، عاود جرّب من فضلك");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Question label="شنية وضعيتك توّا؟">
        <Choice
          selected={situation === "deja_livreur"}
          onClick={() => setSituation("deja_livreur")}
        >
          نخدم توّا كليفرور 🛵
        </Choice>
        <Choice
          selected={situation === "bientot"}
          onClick={() => setSituation("bientot")}
        >
          مازلت ما بديتش، أما باش نبدا قريب
        </Choice>
      </Question>

      {situation === "deja_livreur" && (
        <Question label="عندك قدّاش وانتي تخدم؟">
          <div className="flex gap-2">
            <Choice
              selected={experience === "moins_2ans"}
              onClick={() => setExperience("moins_2ans")}
            >
              أقل من عامين
            </Choice>
            <Choice
              selected={experience === "plus_2ans"}
              onClick={() => setExperience("plus_2ans")}
            >
              أكثر من عامين
            </Choice>
          </div>
        </Question>
      )}

      <div className="h-px bg-hair" />

      <Question label="تعمل في محتوى على السوشيال (انستا / تيك توك) على خدمتك كليفرور؟ 🎥">
        <div className="flex gap-2">
          <Choice
            selected={creeContenu === true}
            onClick={() => setCreeContenu(true)}
          >
            أي
          </Choice>
          <Choice
            selected={creeContenu === false}
            onClick={() => setCreeContenu(false)}
          >
            لا
          </Choice>
        </div>
      </Question>

      {creeContenu === true && (
        <Question label="حطّ الكونت متاعك (انستا ولا تيك توك)">
          <input
            value={compteSocial}
            onChange={(e) => setCompteSocial(e.target.value)}
            placeholder="@compte ولا لينك"
            dir="ltr"
            className={input}
          />
        </Question>
      )}

      <Question label="في أنا منطقة (ولا مناطق) تخدم؟">
        <input
          value={zones}
          onChange={(e) => setZones(e.target.value)}
          placeholder="مثال: اريانة، ساقية الزيت…"
          className={input}
        />
      </Question>

      <Question label="نومرو تليفونك 📞">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="numeric"
          placeholder="20 123 456"
          dir="ltr"
          className={input}
        />
        <p className="text-[13px] text-stone-muted">باش نتواصلو معاك برك .</p>
      </Question>

      {error && (
        <div className="rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-[14px] text-danger-ink">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="h-12 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {sending ? "…" : "ابعث إجابتك"}
      </button>
    </div>
  );
}
