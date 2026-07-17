"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Store, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Commerce, Zone } from "@/lib/config-types";
import type { LatLng } from "@/lib/order-types";
import { searchCommerces } from "@/lib/default-config";
import { formatMeters } from "@/lib/format";
import { type PlaceSuggestion, isMapsEnabled, resolvePlace, searchPlaces } from "@/lib/maps";

type Props = {
  selected: Commerce | null;
  onSelect: (c: Commerce | null) => void;
  /** The tenant's commerce list, searched when Google Places is unavailable. */
  commerces: Commerce[];
  /** Tenant delivery zone — bounds the Places search to deliverable shops. */
  zone: Zone;
  /** Customer position, when known — nearest shops surface first. */
  position?: LatLng | null;
  /** ISO region code (e.g. "tn") from the tenant's phoneCountry. */
  regionCode?: string;
  /** free-text mode ("Introuvable ? Décrivez-le") */
  describe: boolean;
  describeValue: string;
  onDescribeChange: (v: string) => void;
};

/** A row in the dropdown, from Google Places or from the hardcoded fallback. */
type Row = {
  id: string;
  name: string;
  addr: string;
  /** Distance from the customer, when known (Places rows with a position). */
  distanceMeters?: number;
  /** Present only for Places rows — resolving it yields the pickup coordinates. */
  suggestion?: PlaceSuggestion;
};

const DEBOUNCE_MS = 250;

export function CommerceCombo({
  selected,
  onSelect,
  commerces,
  zone,
  position,
  regionCode,
  describe,
  describeValue,
  onDescribeChange,
}: Props) {
  const t = useTranslations("Commerce");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [placeRows, setPlaceRows] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Guards against a slow early request overwriting a newer one's results.
  const seq = useRef(0);

  const places = isMapsEnabled();
  const q = query.trim();

  // Without a Maps key the hardcoded list is a pure function of the query, so
  // it needs no state and no effect.
  const rows: Row[] = places ? (q === "" ? [] : placeRows) : searchCommerces(commerces, q);

  useEffect(() => {
    if (!places || q === "") return;

    // Debounce: Places bills per keystroke-session, and an un-throttled request
    // per character is both slow and wasteful. The spinner is raised inside the
    // timer, so a fast typist never sees it flash.
    const id = ++seq.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchPlaces(q, { zone, origin: position, regionCode });
        if (seq.current !== id) return; // a newer keystroke won
        setPlaceRows(
          found.map((s) => ({
            id: s.placeId,
            name: s.name,
            addr: s.secondary,
            distanceMeters: s.distanceMeters,
            suggestion: s,
          })),
        );
      } catch (err) {
        console.error("[places] search failed:", err);
        if (seq.current === id) setPlaceRows(searchCommerces(commerces, q)); // fall back to the local list
      } finally {
        if (seq.current === id) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [q, places, commerces, zone, position, regionCode]);

  async function pick(row: Row) {
    setOpen(false);
    setQuery("");

    // Local fallback rows already carry everything we need.
    if (!row.suggestion) {
      onSelect({ id: row.id, name: row.name, addr: row.addr });
      return;
    }

    setResolving(true);
    try {
      const place = await resolvePlace(row.suggestion);
      onSelect({
        id: place.placeId,
        name: place.name,
        addr: place.addr,
        lat: place.lat,
        lng: place.lng,
      });
    } catch (err) {
      // Keep the commerce, lose only the coordinates: the order still works,
      // it just falls back to the straight-line fee estimate.
      console.error("[places] resolve failed:", err);
      onSelect({ id: row.id, name: row.name, addr: row.addr });
    } finally {
      setResolving(false);
    }
  }

  // Free-text "describe it" mode
  if (describe) {
    return (
      <div className="relative">
        <Store className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-muted" />
        <Input
          value={describeValue}
          onChange={(e) => onDescribeChange(e.target.value)}
          placeholder={t("describePlaceholder")}
          aria-label={t("describeAria")}
          className="h-12 rounded-[10px] ps-[42px] text-[15px]"
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
          aria-label={t("removeAria")}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-muted transition-colors hover:bg-brand-fill"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  const showDropdown = open && q !== "";
  // `searching` can outlive a cleared query (its timer was cancelled mid-flight).
  const busy = (searching && q !== "") || resolving;

  // Typeahead
  return (
    <div className="relative flex flex-col">
      <div className="relative">
        <Store className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-muted" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchAria")}
          disabled={resolving}
          className="h-12 rounded-[10px] ps-[42px] pe-10 text-[15px]"
        />
        {busy && (
          <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-stone-muted" />
        )}
      </div>

      {showDropdown && (
        <div className="anim-fade-in absolute top-full z-10 mt-1.5 flex w-full flex-col overflow-hidden rounded-[10px] border border-hair bg-white shadow-[0_8px_24px_rgba(28,25,23,0.10)]">
          {rows.length === 0 ? (
            <div className="p-3.5 text-center text-[14px] text-stone-muted">
              {busy ? t("searching") : t("noResults")}
            </div>
          ) : (
            rows.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={`flex min-h-12 w-full flex-col items-start gap-px px-3.5 py-2.5 text-start transition-colors hover:bg-brand-bg ${
                  i === 0 ? "bg-brand-bg" : "border-t border-hair-2"
                }`}
              >
                <div className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[15px] font-medium text-stone-ink">{c.name}</span>
                  {c.distanceMeters != null && (
                    <span className="flex-none text-[12px] font-medium text-brand tabular-nums">
                      {formatMeters(c.distanceMeters)}
                    </span>
                  )}
                </div>
                <span className="truncate text-[13px] text-stone-muted">{c.addr}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
