"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { DJERBA_CENTER, MAP_ID, isMapsEnabled, loadMapLibs } from "@/lib/maps";
import { avatarTint, initials, mappable, type CrewMember } from "@/lib/crew";

/**
 * Everyone's last known position, on one map.
 *
 * Last KNOWN, and the map says so: a fix older than the dispatch window draws
 * grey, because a driver's phone stops reporting the moment they close the app
 * (see use-foreground-position — a PWA cannot track in the background). A map
 * that drew every pin the same colour would quietly claim a coverage the app
 * does not have.
 */

/** The disc itself, built as DOM: an advanced marker takes a node, not JSX. */
function avatarNode(member: CrewMember): HTMLElement {
  const el = document.createElement("div");
  // Inline styles rather than classes: this node is created at runtime, and
  // Tailwind only emits what it can see in the source.
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:36px",
    "height:36px",
    "border-radius:9999px",
    "color:#fff",
    "font:600 12px/1 system-ui, sans-serif",
    `background:${member.positionFresh ? avatarTint(member.id) : "#A8A29E"}`,
    `box-shadow:0 0 0 2px ${member.order ? "#0F766E" : "#fff"}, 0 2px 6px rgba(28,25,23,.3)`,
  ].join(";");
  el.textContent = initials(member.name);
  return el;
}

export function CrewMap({ crew }: { crew: CrewMember[] }) {
  const t = useTranslations("Dashboard.crew");
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const pinned = mappable(crew);
  // Re-run the marker effect only when a position actually moves, not on every
  // parent render — the page refreshes itself on a timer.
  const signature = pinned
    .map((m) => `${m.id}:${m.lat}:${m.lng}:${m.positionFresh}:${!!m.order}`)
    .join("|");

  useEffect(() => {
    if (!isMapsEnabled()) return;
    let cancelled = false;

    void (async () => {
      const { Map, AdvancedMarkerElement } = await loadMapLibs();
      if (cancelled || !hostRef.current) return;

      const map =
        mapRef.current ??
        new Map(hostRef.current, {
          center: DJERBA_CENTER,
          zoom: 13,
          mapId: MAP_ID,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
      mapRef.current = map;

      for (const marker of markersRef.current) marker.map = null;
      markersRef.current = [];

      const bounds = new google.maps.LatLngBounds();
      for (const member of pinned) {
        const position = { lat: member.lat as number, lng: member.lng as number };
        markersRef.current.push(
          new AdvancedMarkerElement({
            map,
            position,
            title: member.name ?? "",
            content: avatarNode(member),
          }),
        );
        bounds.extend(position);
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 64);
        // One driver on the map means one point, and fitBounds on a point zooms
        // to the building. Pull back to a useful street view.
        if (pinned.length === 1) map.setZoom(15);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers) marker.map = null;
    };
  }, []);

  if (!isMapsEnabled()) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[14px] text-stone-muted">
        {t("mapUnavailable")}
      </div>
    );
  }

  if (pinned.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[14px] text-stone-muted">
        {t("mapEmpty")}
      </div>
    );
  }

  return <div ref={hostRef} className="flex-1" />;
}
