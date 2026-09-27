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
  label?: string;
};

const MAX_PINS = 28;
const NYC: L.LatLngExpression = [40.7128, -73.97];

/** Same orange → yellow → green scale as the Turnover gauge. */
export function turnoverScaleColor(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100;
  const stops: [number, [number, number, number]][] = [
    [0, [249, 115, 22]], // #F97316
    [0.5, [234, 179, 8]], // #EAB308
    [1, [34, 197, 94]], // #22C55E
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i += 1;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

function sizeFor(pin: Pin) {
  // Keep sizes tight so the map stays scannable.
  const base = 9 + Math.round((Math.min(100, Math.max(0, pin.turnover)) / 100) * 7);
  return pin.active ? base + 3 : base;
}

export default function MapCanvas({
  pins,
  onSelect,
}: {
  pins: Pin[];
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const pinKey = pins.map((p) => `${p.id}:${p.active ? 1 : 0}:${p.turnover}`).join("|");
  const activeId = pins.find((p) => p.active)?.id ?? "";

  useEffect(() => {
    const el = container.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
    }).setView(NYC, 12);

    // OpenStreetMap with soft CSS tint — light color (water/parks) without a paid basemap key.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
      className: "ll-tiles",
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const refresh = () => map.invalidateSize({ animate: false });
    refresh();
    const frame = requestAnimationFrame(refresh);
    const timer = window.setTimeout(refresh, 120);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    observer?.observe(el);
    window.addEventListener("resize", refresh);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const sorted = [...pins].sort((a, b) => b.turnover - a.turnover);
    const pinsToDraw =
      sorted.length > MAX_PINS
        ? [
            ...sorted.filter((p) => p.active),
            ...sorted.filter((p) => !p.active).slice(0, MAX_PINS - (sorted.some((p) => p.active) ? 1 : 0)),
          ]
        : sorted;

    pinsToDraw.forEach((pin) => {
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return;

      const size = sizeFor(pin);
      const color = turnoverScaleColor(pin.turnover);
      const icon = L.divIcon({
        className: "ll-marker",
        html: pin.active
          ? `<button type="button" class="pin-dot is-active" style="width:${size}px;height:${size}px;background:${color}" aria-label="${escapeHtml(pin.label ?? "Selected storefront")}"></button><span class="pin-label">${escapeHtml(pin.label ?? "Storefront")}</span>`
          : `<button type="button" class="pin-dot" style="width:${size}px;height:${size}px;background:${color}" aria-label="Turnover ${pin.turnover}"></button>`,
        iconSize: pin.active ? [Math.max(size + 8, 120), Math.max(size + 8, 28)] : [size + 4, size + 4],
        iconAnchor: [size / 2, size / 2],
      });

      L.marker([pin.lat, pin.lng], {
        icon,
        keyboard: false,
        riseOnHover: true,
        zIndexOffset: pin.active ? 600 : Math.round(pin.turnover),
      })
        .on("click", () => onSelectRef.current(pin.id))
        .addTo(group);
    });

    map.invalidateSize({ animate: false });
  }, [pins, pinKey, activeId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize({ animate: false });
    if (!pins.length) {
      map.setView(NYC, 12, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng] as [number, number]));
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, {
      padding: [56, 56],
      maxZoom: 13,
      animate: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  useEffect(() => {
    const map = mapRef.current;
    const active = pins.find((pin) => pin.id === activeId);
    if (!map || !active) return;
    map.invalidateSize({ animate: false });
    map.setView([active.lat, active.lng], Math.max(map.getZoom(), 13), { animate: true });
  }, [activeId, pins]);

  return (
    <div className="map-shell">
      <div ref={container} className="map-root" role="application" aria-label="Storefront map" />
      <aside className="map-legend" aria-label="Turnover scale">
        <span className="map-legend-label">Turnover</span>
        <span className="map-legend-bar" />
        <span className="map-legend-ends">
          <i>Low</i>
          <i>High</i>
        </span>
      </aside>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
