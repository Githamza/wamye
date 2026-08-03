"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  DECLINE_REASONS,
  requiresNote,
  type DeclineReason,
} from "@/lib/decline-reasons";

/**
 * "Je ne prends pas cette course" — pick a reason.
 *
 * Suggestions rather than a blank box: a driver on a scooter will not type, and
 * free text produces fifty spellings of the same thing that nobody can count.
 * "Autre" keeps the escape hatch, and is the only one that demands a written
 * word — an "other" with nothing written teaches us nothing.
 *
 * Big tap targets on purpose. This gets used one-handed, outdoors, in a hurry.
 */
export function DeclineSheet({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: DeclineReason, note: string) => void;
}) {
  const t = useTranslations("Dashboard.course");
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const [note, setNote] = useState("");

  const noteNeeded = reason !== null && requiresNote(reason);
  const ready = reason !== null && (!noteNeeded || note.trim() !== "");

  return (
    <div className="flex flex-col gap-3 border-t border-hair pt-3">
      <p className="text-[13px] font-medium text-stone-ink">
        {t("declineTitle")}
      </p>

      <div className="flex flex-col gap-1.5">
        {DECLINE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            aria-pressed={reason === r}
            className={`flex h-11 items-center rounded-[10px] border px-3.5 text-start text-[14px] transition-colors ${
              reason === r
                ? "border-brand bg-brand-bg font-medium text-brand"
                : "border-hair text-stone-ink hover:bg-hair-2"
            }`}
          >
            {t(`declineReason.${r}`)}
          </button>
        ))}
      </div>

      {noteNeeded && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={280}
          autoFocus
          placeholder={t("declineNotePlaceholder")}
          className="w-full rounded-[10px] border border-hair px-3 py-2 text-[14px] outline-none focus:border-brand"
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex h-11 flex-1 items-center justify-center rounded-[10px] border border-hair text-[14px] font-medium text-stone-muted transition-colors hover:bg-hair-2 disabled:opacity-60"
        >
          {t("declineBack")}
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => reason && onConfirm(reason, note)}
          className="flex h-11 flex-1 items-center justify-center rounded-[10px] bg-stone-ink text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {t("declineConfirm")}
        </button>
      </div>
    </div>
  );
}
