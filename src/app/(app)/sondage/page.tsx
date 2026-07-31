import type { Metadata } from "next";
import { SurveyForm } from "@/components/survey-form";

export const metadata: Metadata = {
  title: "سؤالين برك — Wamye",
  description: "جاوبنا على سؤالين باش نفهمو أكثر شكون اللي معانا.",
};

export default function SondagePage() {
  // dir=rtl local : le layout (app) suit la locale du viewer, mais cette
  // page est rédigée en derja quelle que soit la locale.
  return (
    <div dir="rtl" className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-stone-ink">سؤالين برك 🙏</h1>
        <p className="text-[14px] text-stone-muted">
          جاوبنا على السؤالات هاذم باش نفهمو أكثر شكون اللي معانا — ياخذو منك دقيقة.
        </p>
      </div>

      <SurveyForm />
    </div>
  );
}
