"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import { toast } from "sonner";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/djerba";

export function ClosedOverlay({ title }: { title: string }) {
  const [phone, setPhone] = useState("");
  const valid = isValidPhone(phone);

  return (
    <div className="anim-fade-in absolute inset-0 z-20 flex items-center justify-center bg-[rgba(28,25,23,0.30)] p-6">
      <div className="flex w-full flex-col items-center gap-3.5 rounded-2xl bg-white px-5 py-6 text-center shadow-[0_20px_48px_rgba(28,25,23,0.25)]">
        <div className="flex size-14 items-center justify-center rounded-full bg-hair-2">
          <Moon className="size-[26px] text-stone-muted2" strokeWidth={1.5} />
        </div>
        <div>
          <div className="text-lg font-semibold text-stone-ink">{title}</div>
          <div className="text-[14px] leading-normal text-stone-muted">
            Laissez votre numéro, on vous prévient à l&apos;ouverture
          </div>
        </div>
        <div className="flex h-12 w-full items-stretch overflow-hidden rounded-[10px] border border-hair">
          <div className="flex flex-none items-center border-r border-hair bg-hair-2 px-3 text-[15px] text-stone-muted">
            +33
          </div>
          <input
            value={formatPhone(phone)}
            onChange={(e) => setPhone(normalizePhone(e.target.value))}
            inputMode="numeric"
            placeholder="06 12 34 56 78"
            aria-label="Téléphone"
            className="min-w-0 flex-1 bg-white px-3.5 text-[15px] text-stone-ink outline-none"
          />
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={() => toast.success("C'est noté — on vous prévient à l'ouverture 👋")}
          className="h-12 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-hair disabled:text-stone-faint"
        >
          Être prévenu
        </button>
      </div>
    </div>
  );
}
