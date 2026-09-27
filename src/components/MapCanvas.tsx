"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { STORE_SCORE_HELP, STORE_SCORE_LABEL } from "@/lib/signals";
import { turnoverScaleColor } from "@/lib/turnoverColor";

export type Pin = {
  id: string;
  lng: number;
  lat: number;
  turnover: number;
  active: boolean;
  label?: string;
};

const NYC: L.LatLngExpression = [40.7128, -73.97];

export { turnoverScaleColor };

function sizeFor(pin: Pin) {
  const base = 8 + Math.round((Math.min(100, Math.max(0, pin.turnover)) / 100) * 10);
  return pin.active ? base + 4 : base;
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

    const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();

    // CARTO requires `?key=` (not apikey). Fall back to Esri if tiles error.
    const esri = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
        maxZoom: 16,
        className: "ll-tiles",
      },
    );

    const carto = cartoKey
      ? L.tileLayer(
          `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
            className: "ll-tiles",
            errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
          },
        )
      : null;

    const basemap = carto ?? esri;
    basemap.addTo(map);
    if (carto) {
      let fellBack = false;
      carto.on("tileerror", () => {
        if (fellBack) return;
        fellBack = true;
        map.removeLayer(carto);
        esri.addTo(map);
      });
    }

    L.control.zoom({ position: "bottomright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const refresh = () => map.invalidateSize({ animate: false });
    refresh();
    const frame = requestAnimationFrame(refresh);
    const timer = window.setTimeout(refresh, 120);
    const timer2 = window.setTimeout(refresh, 400);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    observer?.observe(el);
    window.addEventListener("resize", refresh);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(timer2);
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

    // Draw every result pin — a low cap was hiding lower-turnover boroughs (e.g. Manhattan)
    // when the unfiltered list was dominated by Brooklyn.
    pins.forEach((pin) => {
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return;

      const size = sizeFor(pin);
      const color = turnoverScaleColor(pin.turnover);
      const icon = L.divIcon({
        className: "ll-marker",
        html: `<button type="button" class="pin-dot${pin.active ? " is-active" : ""}" style="width:${size}px;height:${size}px;background:${color}" aria-label="${escapeHtml(pin.active ? pin.label ?? "Selected storefront" : `${STORE_SCORE_LABEL} ${pin.turnover}`)}"></button>`,
        iconSize: [size + 4, size + 4],
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
      <aside className="map-legend" aria-label={`${STORE_SCORE_LABEL} scale`}>
        <span className="map-legend-label label-tip" title={STORE_SCORE_HELP} tabIndex={0}>
          {STORE_SCORE_LABEL}
        </span>
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
