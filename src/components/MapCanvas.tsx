"use client";

import maplibregl, { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl("/maplibre-gl-csp-worker.js");

export type Pin = {
  id: string;
  lng: number;
  lat: number;
  turnover: number;
  active: boolean;
};

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f7faf8" } },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": "#c5ddc2" },
    },
    {
      id: "wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      minzoom: 11,
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": "#b7d4b4" },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#b9d6ee" },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": "#b9d6ee", "line-width": 1.4 },
    },
  ],
};

export default function MapCanvas({
  pins,
  onSelect,
}: {
  pins: Pin[];
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pinKey = pins.map((pin) => pin.id).join("|");
  const activeId = pins.find((pin) => pin.active)?.id ?? "";

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [-73.97, 40.7],
      zoom: 11,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "bottom-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: false, customAttribution: "© OpenStreetMap © OpenFreeMap" }),
      "bottom-right",
    );
    mapRef.current = map;
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
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
      const wrap = document.createElement("div");
      wrap.className = "ll-marker";
      const button = document.createElement("button");
      button.type = "button";
      button.className = `pin${pin.active ? " is-active" : ""}`;
      button.dataset.level = level;
      button.setAttribute("aria-label", `Turnover index ${pin.turnover}`);
      button.textContent = String(pin.turnover);
      button.addEventListener("click", () => onSelectRef.current(pin.id));
      wrap.appendChild(button);
      return new maplibregl.Marker({ element: wrap, anchor: "center" }).setLngLat([pin.lng, pin.lat]).addTo(map);
    });
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pins.length) return;
    const bounds = new maplibregl.LngLatBounds();
    pins.forEach((pin) => bounds.extend([pin.lng, pin.lat]));
    const narrow = window.innerWidth < 860;
    map.resize();
    map.fitBounds(bounds, {
      padding: narrow
        ? { top: 60, bottom: 360, left: 24, right: 24 }
        : { top: 40, bottom: 40, left: 480, right: 230 },
      maxZoom: 13,
      duration: 600,
    });
    // Refit only when the result set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  useEffect(() => {
    const map = mapRef.current;
    const active = pins.find((pin) => pin.id === activeId);
    if (!map || !active) return;
    const narrow = window.innerWidth < 860;
    const zoom = Math.max(map.getZoom(), 13);
    const point = map.project([active.lng, active.lat]);
    point.x -= narrow ? 0 : 180;
    point.y -= narrow ? -120 : 0;
    map.easeTo({ center: map.unproject(point), zoom, duration: 500 });
  }, [activeId, pins]);

  return <div ref={container} className="map-root" />;
}
