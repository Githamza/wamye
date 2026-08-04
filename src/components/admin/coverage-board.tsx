"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CoverageMap } from "@/components/admin/coverage-map";
import {
  groupByGovernorate,
  splitUnplaced,
  type Livreur,
  type PositionSource,
  type Region,
} from "@/lib/coverage";
import { governorate } from "@/lib/tunisia";
import { statusLabel } from "@/lib/labels";

/**
 * The national view: a map of Tunisia with one bubble per governorate, the same
 * numbers as a ranking beside it, and the livreurs behind whichever governorate
 * is selected.
 *
 * The ranking is not a fallback for the map — it is the half you act on. The map
 * answers "where are they", the list answers "who do I call to open Sousse".
 */

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-hair text-stone-muted2",
};

/**
 * How the position was obtained, said plainly. A super-admin about to plan a
 * city launch on these bubbles has to be able to see that most of them come
 * from a line of text typed at signup, not from a phone.
 */
const SOURCE_LABEL: Record<PositionSource, string> = {
  gps: "GPS",
  zone: "zone",
  label: "déclaré",
  abroad: "hors Tunisie",
  unknown: "inconnu",
};

const SOURCE_CLASS: Record<PositionSource, string> = {
  gps: "bg-brand-bg text-brand-ink",
  zone: "bg-brand-bg text-brand-ink",
  label: "bg-hair-2 text-stone-muted2",
  abroad: "bg-danger-bg text-danger-ink",
  unknown: "bg-hair-2 text-stone-muted",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] border border-hair bg-white px-4 py-3">
      <span className="text-[20px] font-semibold leading-none text-stone-ink">{value}</span>
      <span className="text-[12px] text-stone-muted">{label}</span>
    </div>
  );
}

function LivreurRow({ livreur }: { livreur: Livreur }) {
  const also = livreur.alsoGovKeys
    .map((key) => governorate(key)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <li className="flex items-start gap-3 border-b border-hair px-3.5 py-3 last:border-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/tenants/${livreur.tenantId}`}
            className="text-[14px] font-medium text-stone-ink hover:text-brand hover:underline"
          >
            {livreur.name}
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              STATUS_CLASS[livreur.status] ?? "bg-hair text-stone-muted2"
            }`}
          >
            {statusLabel(livreur.status)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${SOURCE_CLASS[livreur.source]}`}
            title={
              livreur.source === "label"
                ? `Placé d'après « ${livreur.matched} »`
                : livreur.source === "gps"
                  ? "Dernière position remontée par son téléphone"
                  : livreur.source === "zone"
                    ? "Centre de sa zone de livraison"
                    : undefined
            }
          >
            {SOURCE_LABEL[livreur.source]}
            {livreur.fuzzy ? " ?" : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-stone-muted">
          {livreur.areaLabel ? (
            <span className="text-stone-muted2">« {livreur.areaLabel} »</span>
          ) : (
            <span className="italic">zone non renseignée</span>
          )}
          {also && <span>aussi : {also}</span>}
          {livreur.positionAgeMin != null && <span>vu il y a {livreur.positionAgeMin} min</span>}
        </div>
      </div>
      {livreur.phone && (
        <a
          href={`tel:${livreur.phone}`}
          className="shrink-0 rounded-[8px] border border-hair px-2.5 py-1 text-[12px] font-medium text-brand hover:bg-hair-2"
        >
          {livreur.phone}
        </a>
      )}
    </li>
  );
}

function RegionRow({
  region,
  selected,
  onSelect,
}: {
  region: Region;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-3 border-b border-hair px-3.5 py-2.5 text-left last:border-0 ${
          selected ? "bg-brand-bg" : "hover:bg-hair-2"
        }`}
      >
        {/* Count first: the floating support widget sits over the bottom-right
            corner of this panel, and the number is what must stay readable. */}
        <span className="w-7 shrink-0 text-right text-[15px] font-semibold text-stone-ink">
          {region.total}
        </span>
        <span className="flex-1 truncate text-[14px] font-medium text-stone-ink">
          {region.gov.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px]">
          {region.active > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
              {region.active} actif{region.active > 1 ? "s" : ""}
            </span>
          )}
          {region.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">
              {region.pending} en attente
            </span>
          )}
          {region.also > 0 && (
            <span className="text-stone-faint" title="couverture secondaire">
              +{region.also}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function CoverageBoard({ livreurs }: { livreurs: Livreur[] }) {
  const regions = useMemo(() => groupByGovernorate(livreurs), [livreurs]);
  const unplaced = useMemo(() => splitUnplaced(livreurs), [livreurs]);

  // Opens on the biggest governorate: the page is a launch decision, and the
  // top of the ranking is where that decision starts.
  const [selectedKey, setSelectedKey] = useState<string | null>(regions[0]?.gov.key ?? null);

  const maxTotal = regions.reduce((max, r) => Math.max(max, r.total), 0);
  const placedCount = livreurs.filter((l) => l.govKey !== null).length;
  const preciseCount = livreurs.filter((l) => l.source === "gps" || l.source === "zone").length;

  const selected = regions.find((r) => r.gov.key === selectedKey) ?? null;
  const selectedLivreurs = useMemo(() => {
    if (!selectedKey) return [];
    return livreurs
      .filter((l) => l.govKey === selectedKey || l.alsoGovKeys.includes(selectedKey))
      .sort((a, b) => {
        // Primary area first — a livreur who merely also covers this
        // governorate is not who you call to open it.
        const primary = Number(b.govKey === selectedKey) - Number(a.govKey === selectedKey);
        if (primary !== 0) return primary;
        const status = Number(b.status === "active") - Number(a.status === "active");
        if (status !== 0) return status;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [livreurs, selectedKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={String(livreurs.length)} label="livreurs inscrits" />
        <Stat value={String(regions.filter((r) => r.total > 0).length)} label="gouvernorats couverts" />
        <Stat value={String(placedCount)} label="localisés" />
        <Stat value={String(preciseCount)} label="dont position réelle (GPS / zone)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="h-[52vh] min-h-[320px] overflow-hidden rounded-[14px] border border-hair bg-hair-2 lg:h-[64vh]">
          <CoverageMap
            regions={regions}
            maxTotal={maxTotal}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>

        <div className="flex max-h-[64vh] flex-col overflow-hidden rounded-[14px] border border-hair bg-white">
          <div className="border-b border-hair px-3.5 py-2.5 text-[13px] font-semibold text-stone-ink">
            Par gouvernorat
          </div>
          <ul className="flex-1 overflow-y-auto">
            {regions.map((region) => (
              <RegionRow
                key={region.gov.key}
                region={region}
                selected={region.gov.key === selectedKey}
                onSelect={() => setSelectedKey(region.gov.key)}
              />
            ))}
          </ul>
        </div>
      </div>

      {selected && (
        <div className="flex flex-col overflow-hidden rounded-[14px] border border-hair bg-white">
          <div className="flex items-baseline justify-between border-b border-hair px-3.5 py-2.5">
            <div className="text-[14px] font-semibold text-stone-ink">
              {selected.gov.name}{" "}
              <span className="font-normal text-stone-muted">{selected.gov.nameAr}</span>
            </div>
            <div className="text-[12px] text-stone-muted">
              {plural(selected.total, "livreur", "livreurs")}
              {selected.also > 0 && ` · ${selected.also} en couverture secondaire`}
            </div>
          </div>
          <ul>
            {selectedLivreurs.map((livreur) => (
              <LivreurRow key={livreur.tenantId} livreur={livreur} />
            ))}
          </ul>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-stone-muted">
        La taille d&apos;une bulle est le nombre de livreurs, sa couleur l&apos;état
        du groupe : cyan dès qu&apos;un livreur est validé, ambre quand tout le
        monde attend encore. La plupart des positions viennent de la zone que le
        livreur a écrite à l&apos;inscription — {plural(preciseCount, "livreur", "livreurs")} seulement{" "}
        {preciseCount > 1 ? "ont" : "a"} une position réelle, un PWA ne suivant
        pas en arrière-plan. Un « ? » signale une orthographe corrigée au
        jugé (« Araina » → Ariana).
      </p>

      {(unplaced.unknown.length > 0 || unplaced.abroad.length > 0) && (
        <div className="flex flex-col overflow-hidden rounded-[14px] border border-hair bg-white">
          <div className="border-b border-hair px-3.5 py-2.5 text-[14px] font-semibold text-stone-ink">
            Non localisables
            <span className="ml-2 font-normal text-[12px] text-stone-muted">
              zone illisible ou hors Tunisie — à rappeler pour la renseigner
            </span>
          </div>
          <ul>
            {[...unplaced.unknown, ...unplaced.abroad].map((livreur) => (
              <LivreurRow key={livreur.tenantId} livreur={livreur} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
