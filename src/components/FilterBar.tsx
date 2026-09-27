"use client";

import { useEffect, useMemo, useState } from "react";
import { BOROUGHS, CATEGORIES, NEIGHBORHOODS, NEIGHBORHOOD_BOROUGH } from "@/lib/catalog";
import {
  COMMERCIAL_BUDGETS,
  COMMERCIAL_MUSTS,
  SIZE_BANDS,
  TIMINGS,
  emptyDraft,
  type BudgetBand,
  type RenterProfile,
  type SizeBand,
  type Timing,
} from "@/lib/profile";
import type { SearchFilters } from "@/lib/types";

type FilterChip = {
  id: string;
  label: string;
  active: boolean;
};

function toggleMust(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

/** Always render Location + Use as separate boxes; extras as their own boxes. */
function buildChips(filters: SearchFilters | null, profile: RenterProfile | null): FilterChip[] {
  const chips: FilterChip[] = [];
  const places: string[] = [];
  if (filters?.boroughs.length) places.push(...filters.boroughs);
  if (filters?.neighborhoods.length) places.push(...filters.neighborhoods);
  chips.push({
    id: "location",
    label: places.length ? places.join(", ") : "Location",
    active: places.length > 0,
  });

  const category = filters?.category
    ? `${CATEGORIES.find((c) => c.id === filters.category)?.label ?? filters.category} ready`
    : "Any use";
  chips.push({
    id: "category",
    label: category,
    active: Boolean(filters?.category),
  });

  if (filters?.vacantOnly) chips.push({ id: "vacant", label: "Vacant", active: true });
  if (filters?.nearSubway) chips.push({ id: "subway", label: "Near subway", active: true });
  if (filters?.months) chips.push({ id: "months", label: `${filters.months} mo window`, active: true });
  if (filters?.minTurnover) chips.push({ id: "turnover", label: `Store Score ≥ ${filters.minTurnover}`, active: true });

  const budget = COMMERCIAL_BUDGETS.find((item) => item.id === profile?.budget);
  if (budget && budget.id !== "unsure") chips.push({ id: "budget", label: budget.label, active: true });
  const size = SIZE_BANDS.find((item) => item.id === profile?.size);
  if (size && size.id !== "unsure") chips.push({ id: "size", label: size.label, active: true });

  return chips;
}

type Draft = {
  filters: SearchFilters;
  budget: BudgetBand | null;
  size: SizeBand | null;
  timing: Timing | null;
  mustHaves: string[];
  concept: string;
};

function toDraft(filters: SearchFilters | null, profile: RenterProfile | null): Draft {
  const timingFromMonths = TIMINGS.find((item) => item.months === filters?.months)?.id ?? null;
  return {
    filters: filters
      ? { ...filters }
      : {
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
        },
    budget: profile?.budget ?? null,
    size: profile?.size ?? null,
    timing: profile?.timing ?? timingFromMonths,
    mustHaves: (profile?.mustHaves ?? []).filter((id) => COMMERCIAL_MUSTS.some((item) => item.id === id)),
    concept: profile?.concept ?? "",
  };
}

export function FilterBar({
  filters,
  profile,
  onApply,
}: {
  filters: SearchFilters | null;
  profile: RenterProfile | null;
  onApply: (next: SearchFilters, nextProfile: RenterProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(filters, profile));

  useEffect(() => {
    if (open) setDraft(toDraft(filters, profile));
  }, [open, filters, profile]);

  const chips = buildChips(filters, profile);

  const neighborhoodOptions = useMemo(() => {
    if (!draft.filters.boroughs.length) return NEIGHBORHOODS;
    return NEIGHBORHOODS.filter((name) => draft.filters.boroughs.includes(NEIGHBORHOOD_BOROUGH[name] ?? ""));
  }, [draft.filters.boroughs]);

  function patchFilters(partial: Partial<SearchFilters>) {
    setDraft((current) => ({ ...current, filters: { ...current.filters, ...partial } }));
  }

  function pruneNeighborhoods(boroughs: string[], neighborhoods: string[]) {
    if (!boroughs.length) return neighborhoods;
    return neighborhoods.filter((name) => boroughs.includes(NEIGHBORHOOD_BOROUGH[name] ?? ""));
  }

  function toggleBorough(borough: string) {
    const has = draft.filters.boroughs.includes(borough);
    const boroughs = has
      ? draft.filters.boroughs.filter((b) => b !== borough)
      : [...draft.filters.boroughs, borough];
    patchFilters({
      boroughs,
      neighborhoods: pruneNeighborhoods(boroughs, draft.filters.neighborhoods),
    });
  }

  function toggleNeighborhood(name: string) {
    const has = draft.filters.neighborhoods.includes(name);
    patchFilters({
      neighborhoods: has
        ? draft.filters.neighborhoods.filter((n) => n !== name)
        : [...draft.filters.neighborhoods, name],
    });
  }

  function setTiming(timing: Timing | null) {
    const months = TIMINGS.find((item) => item.id === timing)?.months ?? null;
    setDraft((current) => ({
      ...current,
      timing,
      filters: {
        ...current.filters,
        months,
        vacantOnly: months && months > 0 ? false : current.filters.vacantOnly,
      },
    }));
  }

  return (
    <div className="filter-bar">
      <span className="filter-label">Filter</span>
      <div className="filter-chips" role="list">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="listitem"
            className={chip.active ? "filter-box is-active" : "filter-box"}
            onClick={() => setOpen(true)}
          >
            {chip.label}
          </button>
        ))}
        <button type="button" className="filter-edit" onClick={() => setOpen(true)}>
          Edit filter
        </button>
      </div>

      {open && (
        <div className="filter-modal" role="dialog" aria-label="Edit filters" onClick={() => setOpen(false)}>
          <form
            className="filter-sheet"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const base = profile ?? emptyDraft();
              const nextProfile: RenterProfile = {
                ...base,
                leaseKind: "commercial",
                use: (draft.filters.category as RenterProfile["use"]) ?? base.use,
                budget: draft.budget,
                size: draft.size,
                timing: draft.timing,
                mustHaves: draft.mustHaves,
                concept: draft.concept.trim().slice(0, 80),
                boroughs: draft.filters.boroughs,
                neighborhoods: draft.filters.neighborhoods,
                nearSubway: draft.filters.nearSubway ? true : null,
                beds: null,
                household: null,
                pets: null,
                homeBudget: null,
                savedAt: new Date().toISOString(),
              };
              onApply(draft.filters, nextProfile);
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
              <p className="disclaimer" style={{ marginTop: 0 }}>
                Boroughs and neighborhoods combine as a union — a listing matches if it is in a selected borough or a selected neighborhood.
              </p>
              <div className="option-grid">
                {BOROUGHS.map((borough) => (
                  <button
                    key={borough}
                    type="button"
                    className={draft.filters.boroughs.includes(borough) ? "option is-on" : "option"}
                    onClick={() => toggleBorough(borough)}
                  >
                    {borough}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Neighborhood</p>
              {draft.filters.boroughs.length > 0 && (
                <p className="disclaimer" style={{ marginTop: 0 }}>
                  Showing neighborhoods in {draft.filters.boroughs.join(", ")}.
                </p>
              )}
              <div className="option-grid dense">
                {neighborhoodOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={draft.filters.neighborhoods.includes(name) ? "option is-on" : "option"}
                    onClick={() => toggleNeighborhood(name)}
                  >
                    {name}
                  </button>
                ))}
                {neighborhoodOptions.length === 0 && (
                  <p className="empty">No neighborhoods listed for the selected boroughs.</p>
                )}
              </div>
            </section>

            <section>
              <p className="section-label">Business use</p>
              <div className="option-grid">
                <button
                  type="button"
                  className={!draft.filters.category ? "option is-on" : "option"}
                  onClick={() => patchFilters({ category: null })}
                >
                  Any
                </button>
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={draft.filters.category === category.id ? "option is-on" : "option"}
                    onClick={() => patchFilters({ category: category.id })}
                  >
                    {category.label} ready
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Budget</p>
              <div className="option-grid">
                {COMMERCIAL_BUDGETS.map((band) => (
                  <button
                    key={band.id}
                    type="button"
                    className={draft.budget === band.id ? "option is-on" : "option"}
                    onClick={() => setDraft((current) => ({ ...current, budget: band.id }))}
                  >
                    {band.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Size</p>
              <div className="option-grid">
                {SIZE_BANDS.map((band) => (
                  <button
                    key={band.id}
                    type="button"
                    className={draft.size === band.id ? "option is-on" : "option"}
                    onClick={() => setDraft((current) => ({ ...current, size: band.id }))}
                  >
                    {band.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Timing</p>
              <div className="option-grid">
                {TIMINGS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={draft.timing === item.id ? "option is-on" : "option"}
                    onClick={() => setTiming(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Must-haves</p>
              <div className="option-grid">
                {COMMERCIAL_MUSTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={draft.mustHaves.includes(item.id) ? "option is-on" : "option"}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        mustHaves: toggleMust(current.mustHaves, item.id),
                      }))
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="section-label">Concept</p>
              <input
                className="filter-text"
                type="text"
                maxLength={80}
                placeholder="e.g. neighborhood cafe"
                value={draft.concept}
                onChange={(event) => setDraft((current) => ({ ...current, concept: event.target.value }))}
              />
            </section>

            <section className="filter-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={draft.filters.vacantOnly}
                  onChange={(event) =>
                    patchFilters({
                      vacantOnly: event.target.checked,
                      months: event.target.checked ? null : draft.filters.months,
                    })
                  }
                />
                Vacant filings only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.filters.nearSubway}
                  onChange={(event) => patchFilters({ nearSubway: event.target.checked })}
                />
                Near subway
              </label>
              <label>
                Min Store Score
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.filters.minTurnover || ""}
                  placeholder="0"
                  onChange={(event) =>
                    patchFilters({
                      minTurnover: event.target.value === "" ? 0 : Math.min(100, Number(event.target.value)),
                    })
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
                    filters: {
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
                    },
                    budget: null,
                    size: null,
                    timing: null,
                    mustHaves: [],
                    concept: "",
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
