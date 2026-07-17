"use client";

import { useEffect, useRef, useState } from "react";
import { formatKm } from "@/lib/format";
import {
  DJERBA_CENTER,
  MAP_ID,
  isMapsEnabled,
  loadMapLibs,
  readMarkerPosition,
} from "@/lib/maps";

type Props = {
  initialLat: number;
  initialLng: number;
  initialRadiusKm: number;
};

const MIN_KM = 1;
const MAX_KM = 100;

function clampKm(km: number): number {
  if (!Number.isFinite(km)) return MIN_KM;
  return Math.min(MAX_KM, Math.max(MIN_KM, Math.round(km * 10) / 10));
}

/**
 * Graphic delivery-zone editor: a draggable centre pin + a resizable circle on
 * a real map, backed by hidden inputs (centerLat / centerLng / radiusKm) so it
 * plugs straight into the existing updateGeneral form action. Degrades to plain
 * number inputs when no Google Maps browser key is configured.
 */
export function ZoneMapEditor({ initialLat, initialLng, initialRadiusKm }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);

  const [center, setCenter] = useState({
    lat: Number.isFinite(initialLat) ? initialLat : DJERBA_CENTER.lat,
    lng: Number.isFinite(initialLng) ? initialLng : DJERBA_CENTER.lng,
  });
  const [radiusKm, setRadiusKm] = useState(clampKm(initialRadiusKm));
  const [failed, setFailed] = useState(false);

  const mapsOn = isMapsEnabled();

  useEffect(() => {
    if (!mapsOn) return;
    let cancelled = false;

    void (async () => {
      try {
        const { Map, AdvancedMarkerElement } = await loadMapLibs();
        if (cancelled || !hostRef.current) return;

        const start = { lat: center.lat, lng: center.lng };
        const map = new Map(hostRef.current, {
          center: start,
          zoom: 11,
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });

        const marker = new AdvancedMarkerElement({
          map,
          position: start,
          gmpDraggable: true,
          title: "Centre de la zone",
        });

        const circle = new google.maps.Circle({
          map,
          center: start,
          radius: radiusKm * 1000,
          editable: true, // resize handles
          draggable: false, // centre is moved via the pin only
          strokeColor: "#0F766E",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#0F766E",
          fillOpacity: 0.12,
        });

        // Fit the viewport to the whole circle.
        const b = circle.getBounds();
        if (b) map.fitBounds(b, 24);

        const moveCentre = (pos: { lat: number; lng: number }) => {
          marker.position = pos;
          circle.setCenter(pos);
          setCenter(pos);
        };

        marker.addListener("dragend", () => {
          const pos = readMarkerPosition(marker);
          if (pos) moveCentre(pos);
        });
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          const pos = e.latLng?.toJSON();
          if (pos) moveCentre(pos);
        });
        circle.addListener("radius_changed", () => {
          setRadiusKm(clampKm(circle.getRadius() / 1000));
        });

        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
      } catch (err) {
        console.error("[zone-map] failed to load:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (markerRef.current) markerRef.current.map = null;
      if (circleRef.current) circleRef.current.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      mapRef.current = null;
    };
    // Init once — later state changes are pushed to the map imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slider → circle.
  function onSlider(km: number) {
    const v = clampKm(km);
    setRadiusKm(v);
    circleRef.current?.setRadius(v * 1000);
  }

  const showMap = mapsOn && !failed;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] font-medium text-stone-muted2">Zone de livraison</div>

      {/* Hidden inputs consumed by the updateGeneral form action. */}
      <input type="hidden" name="centerLat" value={center.lat} />
      <input type="hidden" name="centerLng" value={center.lng} />
      <input type="hidden" name="radiusKm" value={radiusKm} />

      {showMap ? (
        <>
          <div
            ref={hostRef}
            className="h-72 w-full overflow-hidden rounded-[12px] border border-hair"
            aria-label="Carte de la zone de livraison"
          />
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-stone-muted2">Rayon</span>
            <input
              type="range"
              min={MIN_KM}
              max={MAX_KM}
              step={1}
              value={radiusKm}
              onChange={(e) => onSlider(Number(e.target.value))}
              className="flex-1 accent-brand"
            />
            <span className="w-16 text-right text-[14px] font-medium text-stone-ink tabular-nums">
              {formatKm(radiusKm)}
            </span>
          </div>
          <p className="text-[12px] text-stone-muted">
            Glissez le pin pour déplacer le centre, la poignée du cercle ou le curseur
            pour régler le rayon.
          </p>
        </>
      ) : (
        // Fallback: plain number inputs (no Maps key configured).
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-stone-muted2">Centre lat</span>
            <input
              type="number"
              step="any"
              value={center.lat}
              onChange={(e) => setCenter((c) => ({ ...c, lat: Number(e.target.value) }))}
              className="h-11 w-full rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-stone-muted2">Centre lng</span>
            <input
              type="number"
              step="any"
              value={center.lng}
              onChange={(e) => setCenter((c) => ({ ...c, lng: Number(e.target.value) }))}
              className="h-11 w-full rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-stone-muted2">Rayon (km)</span>
            <input
              type="number"
              step="any"
              value={radiusKm}
              onChange={(e) => setRadiusKm(clampKm(Number(e.target.value)))}
              className="h-11 w-full rounded-[10px] border border-hair px-3.5 text-[15px] outline-none focus:border-brand"
            />
          </label>
        </div>
      )}
    </div>
  );
}
