"use client";

import { useEffect, useRef, useState } from "react";
import {
  DJERBA_CENTER,
  MAP_ID,
  isMapsEnabled,
  loadMapLibs,
  readMarkerPosition,
} from "@/lib/maps";

type Props = {
  /** The customer's current pin. Falls back to the island centre. */
  position?: { lat: number; lng: number } | null;
  /** Fired when the customer drags the pin to correct their address. */
  onPositionChange?: (pos: { lat: number; lng: number }) => void;
};

const HINT = "Déplacez le pin si besoin";

/** Frame + caption shared by the real map and the mock, so they swap cleanly. */
function MapFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="anim-fade-in relative aspect-[16/9] w-full overflow-hidden rounded-[10px] border border-[#D6E0DB] bg-[#E5EDE9]">
      {children}
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-white/90 px-2.5 py-1 text-xs text-[#57534E]">
        {HINT}
      </div>
    </div>
  );
}

/**
 * The pre-Maps placeholder: a hand-drawn map. Still used whenever no browser
 * key is configured, so the order flow keeps working without Google.
 */
function MockMap() {
  return (
    <MapFrame>
      {/* streets */}
      <div className="absolute inset-x-0 top-[38%] h-[14px] rotate-[-4deg] bg-[#F4F7F5]" />
      <div className="absolute inset-y-0 left-[30%] w-[10px] rotate-[8deg] bg-[#F4F7F5]" />
      <div className="absolute inset-y-0 left-[68%] w-[8px] rotate-[-6deg] bg-[#F4F7F5]" />
      {/* blocks */}
      <div className="absolute left-[8%] top-[10%] h-[34px] w-[52px] rounded-[2px] bg-[#DBE6E0]" />
      <div className="absolute bottom-[12%] right-[10%] h-[28px] w-[64px] rounded-[2px] bg-[#DBE6E0]" />
      {/* pin */}
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0F766E"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[88%] [filter:drop-shadow(0_2px_3px_rgba(28,25,23,0.25))]"
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#F0FDFA" />
        <circle cx="12" cy="10" r="3" fill="#0F766E" stroke="none" />
      </svg>
    </MapFrame>
  );
}

export function MiniMap({ position, onPositionChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [failed, setFailed] = useState(false);

  // Keep the drag handler in a ref: it must not be an effect dependency, or the
  // map would be torn down and rebuilt on every parent render.
  const onChange = useRef(onPositionChange);
  useEffect(() => {
    onChange.current = onPositionChange;
  }, [onPositionChange]);

  // Read once for the initial centre; later prop changes are handled by the
  // sync effect below, so the map is never rebuilt mid-drag.
  const centerRef = useRef(position ?? DJERBA_CENTER);

  useEffect(() => {
    if (!isMapsEnabled()) return;

    let cancelled = false;

    void (async () => {
      try {
        const { Map, AdvancedMarkerElement } = await loadMapLibs();
        // StrictMode runs effects twice; bail if we lost the race.
        if (cancelled || !hostRef.current) return;

        const map = new Map(hostRef.current, {
          center: centerRef.current,
          zoom: 16,
          mapId: MAP_ID,
          // It is a 16:9 confirmation thumbnail, not a map app: strip the
          // chrome so the only affordance is dragging the pin.
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });

        const marker = new AdvancedMarkerElement({
          map,
          position: centerRef.current,
          gmpDraggable: true,
          title: HINT,
        });

        // The new position lives on the marker, not on the event.
        marker.addListener("dragend", () => {
          const pos = readMarkerPosition(marker);
          if (pos) {
            map.panTo(pos);
            onChange.current?.(pos);
          }
        });

        // Tapping the map is a faster way to correct the pin than dragging it.
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          const pos = e.latLng?.toJSON();
          if (!pos) return;
          marker.position = pos;
          map.panTo(pos);
          onChange.current?.(pos);
        });

        mapRef.current = map;
        markerRef.current = marker;
      } catch (err) {
        // A bad key, a missing Map ID, or an offline device — show the mock
        // rather than an empty grey box.
        console.error("[map] failed to load Google Maps:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  // Follow position changes that came from outside (e.g. a fresh geolocation
  // fix). Dragging already moved the marker, so re-setting it is a no-op.
  useEffect(() => {
    if (!position || !markerRef.current || !mapRef.current) return;
    const current = readMarkerPosition(markerRef.current);
    if (current && current.lat === position.lat && current.lng === position.lng) return;
    markerRef.current.position = position;
    mapRef.current.panTo(position);
  }, [position]);

  if (!isMapsEnabled() || failed) return <MockMap />;

  return (
    <MapFrame>
      <div ref={hostRef} className="absolute inset-0" aria-label="Carte de livraison" />
    </MapFrame>
  );
}
