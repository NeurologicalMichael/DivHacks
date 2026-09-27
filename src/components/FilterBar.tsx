"use client";

import { useEffect, useState } from "react";
import { BOROUGHS, CATEGORIES, NEIGHBORHOODS } from "@/lib/catalog";
import type { SearchFilters } from "@/lib/types";

function chipLabel(filters: SearchFilters): string[] {
  const chips: string[] = [];
  if (filters.neighborhoods.length) chips.push(filters.neighborhoods.join(", "));
  else if (filters.boroughs.length) chips.push(filters.boroughs.join(", "));
  else chips.push("Location");
  if (filters.category) {
    const label = CATEGORIES.find((c) => c.id === filters.category)?.label ?? filters.category;
    chips.push(`${label} ready`);
  }
  if (filters.vacantOnly) chips.push("Vacant");
  if (filters.nearSubway) chips.push("Near subway");
  if (filters.months) chips.push(`${filters.months} mo window`);
  if (filters.minTurnover) chips.push(`Turnover ≥ ${filters.minTurnover}`);
  return chips.slice(0, 4);
}

export function FilterBar({
  filters,
  onApply,
}: {
  filters: SearchFilters | null;
  onApply: (next: SearchFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters | null>(filters);

  useEffect(() => {
    if (open) setDraft(filters ? { ...filters } : null);
  }, [open, filters]);

  const chips = filters ? chipLabel(filters) : ["Location"];

  function toggleBorough(borough: string) {
    if (!draft) return;
    const has = draft.boroughs.includes(borough);
    setDraft({
      ...draft,
      boroughs: has ? draft.boroughs.filter((b) => b !== borough) : [...draft.boroughs, borough],
    });
  }

  function toggleNeighborhood(name: string) {
    if (!draft) return;
    const has = draft.neighborhoods.includes(name);
    setDraft({
      ...draft,
      neighborhoods: has ? draft.neighborhoods.filter((n) => n !== name) : [...draft.neighborhoods, name],
    });
  }

  return (
    <div className="filter-bar">
      <span className="filter-label">Filter</span>
      <div className="filter-chips">
        {chips.map((chip) => (
          <button key={chip} type="button" className="filter-chip" onClick={() => setOpen(true)}>
            {chip}
          </button>
        ))}
      </div>
      <button type="button" className="filter-edit" onClick={() => setOpen(true)}>
        Edit filter
      </button>

      {open && draft && (
        <div className="filter-modal" role="dialog" aria-label="Edit filters" onClick={() => setOpen(false)}>
          <form
            className="filter-sheet"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              onApply(draft);
              setOpen(false);
            }}
          >
            <header className="filter-sheet-head">
              <h2>Edit filters</h2>
              <button type="button" className="text-btn" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>

            <section>
              <p className="section-label">Borough</p>
              <div className="option-grid">
                {BOROUGHS.map((borough) => (
                  <button
                    key={borough}
                    type="button"
                    className={draft.boroughs.includes(borough) ? "option is-on" : "option"}
                    onClick={() => toggleBorough(borough)}
                  >
                    {borough}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Neighborhood</p>
              <div className="option-grid dense">
                {NEIGHBORHOODS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={draft.neighborhoods.includes(name) ? "option is-on" : "option"}
                    onClick={() => toggleNeighborhood(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Use / fit</p>
              <div className="option-grid">
                <button
                  type="button"
                  className={!draft.category ? "option is-on" : "option"}
                  onClick={() => setDraft({ ...draft, category: null })}
                >
                  Any
                </button>
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={draft.category === category.id ? "option is-on" : "option"}
                    onClick={() => setDraft({ ...draft, category: category.id })}
                  >
                    {category.label} ready
                  </button>
                ))}
              </div>
            </section>

            <section className="filter-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={draft.vacantOnly}
                  onChange={(event) => setDraft({ ...draft, vacantOnly: event.target.checked, months: event.target.checked ? null : draft.months })}
                />
                Vacant filings only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.nearSubway}
                  onChange={(event) => setDraft({ ...draft, nearSubway: event.target.checked })}
                />
                Near subway
              </label>
              <label>
                Availability window (months)
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={draft.months ?? ""}
                  placeholder="Any"
                  onChange={(event) => {
                    const value = event.target.value === "" ? null : Number(event.target.value);
                    setDraft({
                      ...draft,
                      months: value && value > 0 ? Math.min(24, value) : null,
                      vacantOnly: value && value > 0 ? false : draft.vacantOnly,
                    });
                  }}
                />
              </label>
              <label>
                Min turnover
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.minTurnover || ""}
                  placeholder="0"
                  onChange={(event) =>
                    setDraft({ ...draft, minTurnover: event.target.value === "" ? 0 : Math.min(100, Number(event.target.value)) })
                  }
                />
              </label>
            </section>

            <footer className="filter-sheet-foot">
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setDraft({
                    boroughs: [],
                    neighborhoods: [],
                    category: null,
                    months: null,
                    minTurnover: 0,
                    vacantOnly: false,
                    nearSubway: false,
                    multiSignal: false,
                    landlordOnly: false,
                    address: null,
                  })
                }
              >
                Clear all
              </button>
              <button type="submit" className="primary">
                Apply filters
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
