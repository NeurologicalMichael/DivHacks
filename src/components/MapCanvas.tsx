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

const MAX_PINS = 40;
const NYC: L.LatLngExpression = [40.7128, -73.97];

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
  const radiusRef = useRef<L.Circle[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const pinKey = pins.map((p) => `${p.id}:${p.active ? 1 : 0}`).join("|");
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
      className: "ll-tiles",
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const refresh = () => {
      map.invalidateSize({ animate: false });
    };
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
    radiusRef.current.forEach((c) => c.remove());
    radiusRef.current = [];

    const pinsToDraw =
      pins.length > MAX_PINS
        ? [
            ...pins.filter((p) => p.active),
            ...pins
              .filter((p) => !p.active)
              .slice(0, MAX_PINS - (pins.some((p) => p.active) ? 1 : 0)),
          ]
        : pins;

    pinsToDraw.forEach((pin) => {
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return;

      if (pin.active) {
        const outer = L.circle([pin.lat, pin.lng], {
          radius: 420,
          color: "#A78BFA",
          weight: 0,
          fillColor: "#C4B5FD",
          fillOpacity: 0.22,
          interactive: false,
        }).addTo(map);
        const inner = L.circle([pin.lat, pin.lng], {
          radius: 180,
          color: "#A78BFA",
          weight: 0,
          fillColor: "#C4B5FD",
          fillOpacity: 0.28,
          interactive: false,
        }).addTo(map);
        radiusRef.current.push(outer, inner);
      }

      const icon = L.divIcon({
        className: "ll-marker",
        html: pin.active
          ? `<button type="button" class="pin-sq is-active" aria-label="${escapeHtml(pin.label ?? "Selected storefront")}"></button><span class="pin-label">${escapeHtml(pin.label ?? "Storefront")}</span>`
          : `<button type="button" class="pin-sq" aria-label="Storefront marker"></button>`,
        iconSize: pin.active ? [140, 36] : [16, 16],
        iconAnchor: pin.active ? [8, 18] : [8, 8],
      });

      L.marker([pin.lat, pin.lng], {
        icon,
        keyboard: false,
        riseOnHover: true,
        zIndexOffset: pin.active ? 600 : 0,
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
      padding: [48, 48],
      maxZoom: 14,
      animate: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  useEffect(() => {
    const map = mapRef.current;
    const active = pins.find((pin) => pin.id === activeId);
    if (!map || !active) return;
    map.invalidateSize({ animate: false });
    map.setView([active.lat, active.lng], Math.max(map.getZoom(), 14), { animate: true });
  }, [activeId, pins]);

  return <div ref={container} className="map-root" role="application" aria-label="Storefront map" />;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
