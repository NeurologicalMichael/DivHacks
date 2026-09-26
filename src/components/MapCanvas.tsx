"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type Pin = {
  id: string;
  lng: number;
  lat: number;
  turnover: number;
  active: boolean;
};

export default function MapCanvas({
  pins,
  onSelect,
}: {
  pins: Pin[];
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef<L.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pinKey = pins.map((pin) => pin.id).join("|");
  const activeId = pins.find((pin) => pin.active)?.id ?? "";

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([40.7, -73.97], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = pins.map((pin) => {
      const level = pin.turnover >= 55 ? "high" : pin.turnover >= 35 ? "mid" : "low";
      const icon = L.divIcon({
        className: "ll-marker",
        html: `<button type="button" class="pin${pin.active ? " is-active" : ""}" data-level="${level}" aria-label="Turnover index ${pin.turnover}">${pin.turnover}</button>`,
        iconSize: [40, 28],
        iconAnchor: [20, 14],
      });
      return L.marker([pin.lat, pin.lng], { icon, keyboard: false })
        .on("click", () => onSelectRef.current(pin.id))
        .addTo(map);
    });
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pins.length) return;
    const bounds = L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng]));
    const narrow = window.innerWidth < 860;
    map.invalidateSize();
    map.fitBounds(bounds, {
      paddingTopLeft: narrow ? L.point(24, 60) : L.point(480, 40),
      paddingBottomRight: narrow ? L.point(24, 360) : L.point(230, 40),
      maxZoom: 14,
      animate: true,
    });
    // Refit only when the result set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  useEffect(() => {
    const map = mapRef.current;
    const active = pins.find((pin) => pin.id === activeId);
    if (!map || !active) return;
    const narrow = window.innerWidth < 860;
    const point = map.project([active.lat, active.lng], Math.max(map.getZoom(), 14));
    const shifted = point.subtract(narrow ? [0, -120] : [180, 0]);
    map.setView(map.unproject(shifted, Math.max(map.getZoom(), 14)), Math.max(map.getZoom(), 14), {
      animate: true,
    });
  }, [activeId, pins]);

  return <div ref={container} className="map-root" />;
}
