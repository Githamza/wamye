"use client";

import { useState } from "react";
import { Check, Store, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { type Commerce, searchCommerces } from "@/lib/djerba";

type Props = {
  selected: Commerce | null;
  onSelect: (c: Commerce | null) => void;
  /** free-text mode ("Introuvable ? Décrivez-le") */
  describe: boolean;
  describeValue: string;
  onDescribeChange: (v: string) => void;
};

export function CommerceCombo({
  selected,
  onSelect,
  describe,
  describeValue,
  onDescribeChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = searchCommerces(query);

  // Free-text "describe it" mode
  if (describe) {
    return (
      <div className="relative">
        <Store className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-muted" />
        <Input
          value={describeValue}
          onChange={(e) => onDescribeChange(e.target.value)}
          placeholder="Décrivez le commerce (nom, rue, repère…)"
          aria-label="Décrire le commerce"
          className="h-12 rounded-[10px] pl-[42px] text-[15px]"
        />
      </div>
    );
  }

  // Selected → chip-card
  if (selected) {
    return (
      <div className="anim-fade-in flex min-h-12 items-center gap-2.5 rounded-[10px] border border-brand-border bg-brand-bg px-3.5 py-3">
        <Check className="size-5 shrink-0 text-success" strokeWidth={2} />
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <div className="text-[15px] font-medium text-stone-ink">{selected.name}</div>
          <div className="truncate text-[13px] text-stone-muted">{selected.addr}</div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Retirer le commerce"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-muted transition-colors hover:bg-brand-fill"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  // Typeahead
  return (
    <div className="relative flex flex-col">
      <div className="relative">
        <Store className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-muted" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Restaurant, épicerie, pharmacie…"
          aria-label="Commerce"
          className="h-12 rounded-[10px] pl-[42px] text-[15px]"
        />
      </div>

      {open && query.trim() !== "" && (
        <div className="anim-fade-in absolute top-full z-10 mt-1.5 flex w-full flex-col overflow-hidden rounded-[10px] border border-hair bg-white shadow-[0_8px_24px_rgba(28,25,23,0.10)]">
          {results.length === 0 ? (
            <div className="p-3.5 text-center text-[14px] text-stone-muted">
              Aucun résultat — essayez « Décrivez-le »
            </div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(c);
                  setQuery("");
                  setOpen(false);
                }}
                className={`flex min-h-12 w-full flex-col items-start gap-px px-3.5 py-2.5 text-left transition-colors hover:bg-brand-bg ${
                  i === 0 ? "bg-brand-bg" : "border-t border-hair-2"
                }`}
              >
                <span className="text-[15px] font-medium text-stone-ink">{c.name}</span>
                <span className="text-[13px] text-stone-muted">{c.addr}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
