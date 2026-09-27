"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { METRIC_DEFS, type MetricId } from "@/lib/signals";

const SHORT: Record<MetricId, string> = {
  reported_vacant: "Vacant",
  dof_sale: "Sold",
  alteration_permit: "DOB",
  tenant_activity_changed: "Activity",
  neighborhood_sales_up: "Sales",
  lease_within_6_months: "Lease",
  construction_reported: "Build",
  license_lapsed: "License",
  landlord_opt_in: "Owner",
};

export function MapMetricFilters({
  selected,
  onChange,
}: {
  selected: MetricId[];
  onChange: (next: MetricId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    function measure() {
      const root = rootRef.current;
      const trigger = triggerRef.current;
      const chips = chipsRef.current;
      if (!root || !trigger || !chips) return;

      const natural = chips.scrollWidth;
      const height = chips.offsetHeight;
      const pane = root.closest(".map-pane") ?? root.parentElement;
      const gap = 8;
      const pad = 24;
      const available = Math.max(0, (pane?.clientWidth ?? 0) - pad - trigger.offsetWidth - gap);
      const nextScale = natural > 0 && available > 0 ? Math.min(1, available / natural) : 1;
      const next = {
        scale: nextScale,
        width: Math.ceil(natural * nextScale),
        height: Math.ceil(height * nextScale || height),
      };
      setFit((prev) =>
        prev.scale === next.scale && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    }

    measure();
    const pane = rootRef.current?.closest(".map-pane");
    if (!pane) return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, selected.length]);

  function toggle(id: MetricId) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <div
      ref={rootRef}
      className={open ? "map-signal-island is-open" : "map-signal-island"}
      role="toolbar"
      aria-label="Filter by score signals"
    >
      <button
        ref={triggerRef}
        type="button"
        className={selected.length ? "map-signal-trigger has-active" : "map-signal-trigger"}
        aria-expanded={open}
        aria-controls="map-signal-tray"
        onClick={() => setOpen((value) => !value)}
      >
        Signals
        {selected.length > 0 && <span className="map-signal-count">{selected.length}</span>}
      </button>

      <div id="map-signal-tray" className="map-signal-tray" aria-hidden={!open}>
        <div className="map-signal-tray-inner">
          <div
            className="map-signal-scale"
            style={
              open && fit.width
                ? { width: fit.width, height: fit.height }
                : undefined
            }
          >
            <div
              ref={chipsRef}
              className="map-signal-chips"
              style={
                open
                  ? {
                      transform: `scale(${fit.scale})`,
                      transformOrigin: "top left",
                    }
                  : undefined
              }
            >
              {METRIC_DEFS.map((metric) => {
                const on = selected.includes(metric.id);
                return (
                  <button
                    key={metric.id}
                    type="button"
                    className={on ? "filter-box is-active is-metric-on" : "filter-box"}
                    aria-pressed={on}
                    title={metric.rationale}
                    tabIndex={open ? 0 : -1}
                    onClick={() => toggle(metric.id)}
                  >
                    <i className="metric-swatch" style={{ background: on ? metric.color : "#d1d5db" }} />
                    {SHORT[metric.id]}
                  </button>
                );
              })}
              {selected.length > 0 && (
                <button
                  type="button"
                  className="map-signal-clear"
                  tabIndex={open ? 0 : -1}
                  onClick={() => onChange([])}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
