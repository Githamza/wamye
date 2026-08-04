"use client";

import { useEffect, useRef } from "react";
import { MAP_ID, isMapsEnabled, loadMapLibs } from "@/lib/maps";
import { bubbleRadius, type Region } from "@/lib/coverage";
import { TUNISIA_BOUNDS, TUNISIA_CENTER } from "@/lib/tunisia";

/**
 * The whole country, one bubble per governorate.
 *
 * Bubbles, not pins: for a launch decision the question is never "where is this
 * one livreur standing", it is "how many are there in Sousse". Disc area tracks
 * the count and colour tracks readiness — cyan where at least one livreur is
 * already validated, amber where the whole group is still waiting to be.
 */

type Props = {
  regions: Region[];
  /** The biggest count on the map — bubbles are scaled against it. */
  maxTotal: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

const ACTIVE_FILL = "rgba(0,129,159,.82)";
const PENDING_FILL = "rgba(180,83,9,.82)";

/** The bubble, built as DOM: an advanced marker takes a node, not JSX. */
function bubbleNode(region: Region, maxTotal: number, selected: boolean): HTMLElement {
  const size = Math.round(bubbleRadius(region.total, maxTotal) * 2);
  const el = document.createElement("div");
  el.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "cursor:pointer",
    // Inline styles because this node is created at runtime and Tailwind only
    // emits classes it can see in the source.
    "font:600 12px/1 system-ui, sans-serif",
  ].join(";");

  const disc = document.createElement("div");
  disc.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:9999px",
    "color:#fff",
    `font-size:${size >= 44 ? 15 : 12}px`,
    "font-weight:700",
    `background:${region.active > 0 ? ACTIVE_FILL : PENDING_FILL}`,
    `box-shadow:0 0 0 ${selected ? 3 : 2}px ${selected ? "#1C1917" : "#fff"}, 0 2px 8px rgba(28,25,23,.35)`,
  ].join(";");
  disc.textContent = String(region.total);

  const label = document.createElement("div");
  label.style.cssText = [
    "margin-top:3px",
    "padding:1px 5px",
    "border-radius:5px",
    "background:rgba(255,255,255,.9)",
    "color:#1C1917",
    "font-size:11px",
    "white-space:nowrap",
  ].join(";");
  label.textContent = region.gov.name;

  el.append(disc, label);
  return el;
}

export function CoverageMap({ regions, maxTotal, selectedKey, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  /**
   * The node the cached map was built on.
   *
   * A Maps instance is bound to the div it was constructed with, and React is
   * free to hand this component a fresh node (StrictMode's double mount, Fast
   * Refresh, or any remount). Reusing the cached map then draws the markers on
   * a div nobody can see — which is exactly what happened, silently: the map
   * appeared, the bubbles did not.
   */
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  // Kept in a ref so a new callback identity never rebuilds the markers.
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  const signature = regions.map((r) => `${r.gov.key}:${r.total}:${r.active}`).join("|");

  useEffect(() => {
    if (!isMapsEnabled()) return;
    let cancelled = false;

    void (async () => {
      const { Map, AdvancedMarkerElement } = await loadMapLibs();
      if (cancelled || !hostRef.current) return;
      const host = hostRef.current;

      let map = mapRef.current;
      if (!map || mapHostRef.current !== host) {
        map = new Map(host, {
          center: TUNISIA_CENTER,
          // A country-sized starting zoom, in case the fit below cannot run.
          zoom: 6,
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        // Frame the country once, on creation only: re-fitting on every data
        // change would yank the view back each time someone zooms into a city.
        //
        // On the first idle rather than immediately: fitBounds measures the
        // container, and at construction time this one has not been laid out at
        // its final height yet — fitting then leaves Tunisia a stamp in the
        // middle of the Mediterranean.
        google.maps.event.addListenerOnce(map, "idle", () => {
          mapRef.current?.fitBounds(TUNISIA_BOUNDS, 24);
        });
        mapRef.current = map;
        mapHostRef.current = host;
        // Markers from the previous host died with it; do not try to unset them.
        markersRef.current = [];
      }

      for (const marker of markersRef.current) marker.map = null;
      markersRef.current = [];

      for (const region of regions) {
        if (region.total === 0) continue;
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: region.gov.lat, lng: region.gov.lng },
          title: `${region.gov.name} — ${region.total} livreur${region.total > 1 ? "s" : ""}`,
          content: bubbleNode(region, maxTotal, region.gov.key === selectedKey),
          // Bigger bubbles must not bury the small ones they overlap.
          zIndex: 100 - region.total,
        });
        marker.addListener("click", () => select.current(region.gov.key));
        markersRef.current.push(marker);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, maxTotal, selectedKey]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers) marker.map = null;
    };
  }, []);

  if (!isMapsEnabled()) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-stone-muted">
        Carte indisponible : aucune clé Google Maps navigateur n&apos;est
        configurée. Le classement par gouvernorat reste complet.
      </div>
    );
  }

  return <div ref={hostRef} className="h-full w-full" aria-label="Carte des livreurs en Tunisie" />;
}
