"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { categoryLabel } from "@/lib/catalog";
import { titleAddress } from "@/lib/format";
import { emptyFilters } from "@/lib/parseQuery";
import {
  PROFILE_SKIP_KEY,
  loadProfile,
  profileSentence,
  profileToFilters,
  saveProfile,
  type RenterProfile,
} from "@/lib/profile";
import type { Gap, SearchFilters, StorefrontDetail, Summary } from "@/lib/types";
import type { MetricId } from "@/lib/signals";
import { matchMetric } from "@/lib/signals";
import type { Pin } from "./MapCanvas";
import { DetailPanel } from "./DetailPanel";
import { FilterBar } from "./FilterBar";
import { GapPanel } from "./GapPanel";
import { Landing, type Persona } from "./Landing";
import { LandlordPanel } from "./LandlordPanel";
import { MapMetricFilters } from "./MapMetricFilters";
import { Onboarding } from "./Onboarding";
import type { Watch } from "./OwnerPanel";
import { StreetThumb } from "./StreetThumb";

const EXAMPLE = "Show me restaurant-ready storefronts in Brooklyn that may become available in the next 6 months.";

type Mode = "explore" | "gap" | "owner" | "landlord";
type SortKey = "turnover" | "fit" | "name";

function sessionId() {
  const key = "leaselens-session";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function greeting(persona: Persona | null, profile: RenterProfile | null) {
  if (persona === "shop_owner") return "Hi, Shop Owner!";
  if (persona === "landlord") return "Hi, Landlord!";
  if (persona === "entrepreneur") return "Hi Entrepreneur!";
  if (profile) return "Hi there!";
  return "Hi!";
}

export function AppShell({ MapCanvas }: { MapCanvas: ComponentType<{ pins: Pin[]; onSelect: (id: string) => void }> }) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [mode, setMode] = useState<Mode>("explore");
  const [query, setQuery] = useState(EXAMPLE);
  const [filters, setFilters] = useState<SearchFilters | null>(null);
  const [results, setResults] = useState<Summary[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("turnover");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StorefrontDetail | null>(null);
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [gapNeighborhoods, setGapNeighborhoods] = useState<{ name: string; borough: string }[]>([]);
  const [gapNeighborhood, setGapNeighborhood] = useState("Williamsburg");
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [gapNarrative, setGapNarrative] = useState("");
  const [gapSource, setGapSource] = useState("template");
  const [gapDisclaimer, setGapDisclaimer] = useState("");
  const [nearbyFood, setNearbyFood] = useState<number | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [watchNote, setWatchNote] = useState("");
  const [profile, setProfile] = useState<RenterProfile | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [usingProfile, setUsingProfile] = useState(false);
  const [booted, setBooted] = useState(false);
  const [metricFilters, setMetricFilters] = useState<MetricId[]>([]);

  const search = useCallback(async (
    nextQuery: string,
    options?: { filters?: Partial<SearchFilters>; fromProfile?: boolean; keepSelection?: boolean; preferFilters?: boolean },
  ) => {
    setLoading(true);
    setError("");
    if (!options?.keepSelection) {
      setSelectedId(null);
      setDetail(null);
      setExplanation(null);
    }
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: nextQuery,
          summarize: false,
          filters: options?.filters,
          preferFilters: Boolean(options?.preferFilters),
          sessionId: sessionId(),
          fromProfile: Boolean(options?.fromProfile),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed");
      setResults(payload.results);
      setFilters(payload.filters);
      setUsingProfile(Boolean(options?.fromProfile));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const openStorefront = useCallback(async (id: string, category: string | null) => {
    setSelectedId(id);
    setExplanation(null);
    if (mode === "gap" || mode === "landlord") {
      // keep mode
    } else if (persona !== "shop_owner" && persona !== "landlord") {
      setMode("explore");
    }
    const response = await fetch(`/api/storefronts/${encodeURIComponent(id)}?category=${encodeURIComponent(category ?? "storefront")}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load storefront");
    setDetail(payload);
  }, [mode, persona]);

  const loadGap = useCallback(async (neighborhood: string, propertyId?: string | null) => {
    const params = new URLSearchParams({ neighborhood });
    if (propertyId) params.set("propertyId", propertyId);
    const response = await fetch(`/api/gap?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Gap analysis failed");
    setGaps(payload.gaps);
    setGapNarrative(payload.narrative);
    setGapSource(payload.narrativeSource);
    setGapDisclaimer(payload.disclaimer);
    setNearbyFood(payload.nearbyFood);
    setGapNeighborhood(neighborhood);
  }, []);

  const loadWatches = useCallback(async () => {
    const response = await fetch(`/api/owner?sessionId=${sessionId()}`);
    const payload = await response.json();
    setWatches(payload.watches ?? []);
    setWatchNote(payload.note ?? "");
  }, []);

  useEffect(() => {
    fetch("/api/gap").then((r) => r.json()).then((payload) => {
      setGapNeighborhoods(payload.neighborhoods ?? []);
    }).catch(() => undefined);

    let cancelled = false;
    (async () => {
      const id = sessionId();
      let saved = loadProfile();
      try {
        const response = await fetch(`/api/profile?sessionId=${encodeURIComponent(id)}`);
        const payload = await response.json();
        if (payload.profile) {
          saved = payload.profile;
          saveProfile(payload.profile);
        }
      } catch {
        // offline profile ok
      }
      if (cancelled) return;
      if (saved) {
        setProfile(saved);
        setPersona("entrepreneur");
        const sentence = profileSentence(saved);
        setQuery(sentence);
        await search(sentence, { filters: profileToFilters(saved), fromProfile: true });
      } else if (window.localStorage.getItem(PROFILE_SKIP_KEY) === "1") {
        setPersona("entrepreneur");
        await search(EXAMPLE);
      }
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  function applyProfile(next: RenterProfile) {
    saveProfile(next);
    window.localStorage.removeItem(PROFILE_SKIP_KEY);
    setProfile(next);
    setOnboardingOpen(false);
    setPersona("entrepreneur");
    void (async () => {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId(), profile: next }),
      });
      const sentence = profileSentence(next);
      setQuery(sentence);
      await search(sentence, { filters: profileToFilters(next), fromProfile: true });
    })().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not save profile"));
  }

  function choosePersona(next: Persona) {
    setPersona(next);
    // Load results immediately so the map/list are live behind onboarding (matches Figma).
    if (!results.length) {
      search(EXAMPLE).catch((caught) => setError(caught.message));
    }
    if (next === "shop_owner") {
      setMode("owner");
      loadWatches().catch((caught) => setError(caught.message));
      return;
    }
    if (next === "landlord") {
      setMode("landlord");
      return;
    }
    setMode("explore");
    if (!profile) setOnboardingOpen(true);
  }

  function applyFilters(next: SearchFilters) {
    setFilters(next);
    const places = [...next.boroughs, ...next.neighborhoods];
    const place = places.length ? places.join(" / ") : "NYC";
    const use = next.category ? categoryLabel(next.category).toLowerCase() : "storefront";
    const sentence = `${use} storefronts in ${place}${next.months ? ` in the next ${next.months} months` : ""}${next.nearSubway ? " near a subway" : ""}`;
    setQuery(sentence);
    search(sentence, { filters: next, fromProfile: false, preferFilters: true }).catch((caught) => setError(caught.message));
  }

  const sorted = useMemo(() => {
    const copy = [...results];
    if (sortKey === "fit") copy.sort((a, b) => b.fitScore - a.fitScore);
    else if (sortKey === "name") copy.sort((a, b) => a.address.localeCompare(b.address));
    else copy.sort((a, b) => b.turnoverScore - a.turnoverScore);
    return copy;
  }, [results, sortKey]);

  const filtered = useMemo(() => {
    if (!metricFilters.length) return sorted;
    return sorted.filter((result) => {
      const ids = new Set(
        result.metricIds?.length
          ? result.metricIds
          : result.topSignals.map((s) => matchMetric(s.label)?.id).filter(Boolean),
      );
      return metricFilters.every((id) => ids.has(id));
    });
  }, [sorted, metricFilters]);

  const pins = useMemo<Pin[]>(
    () =>
      filtered.map((result) => ({
        id: result.id,
        lng: result.lng,
        lat: result.lat,
        turnover: result.turnoverScore,
        active: result.id === selectedId,
        label: result.neighborhood ? `${result.neighborhood} storefront` : titleAddress(result.address),
      })),
    [filtered, selectedId],
  );

  useEffect(() => {
    if (selectedId && metricFilters.length && !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
      setExplanation(null);
    }
  }, [filtered, metricFilters.length, selectedId]);

  if (!booted) {
    return <div className="boot">Loading LeaseLens…</div>;
  }

  if (!persona) {
    return <Landing onChoose={choosePersona} />;
  }

  const listTitle = persona === "shop_owner" ? "My Storefront" : "Sort by";

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="logo" onClick={() => setPersona(null)}>
            LeaseLens
          </button>
          <button type="button" className="greeting" onClick={() => setOnboardingOpen(true)}>
            {greeting(persona, profile)}
          </button>
        </div>
        <form
          className="top-search"
          onSubmit={(event) => {
            event.preventDefault();
            search(query).catch((caught) => setError(caught.message));
          }}
        >
          <span className="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
              <circle cx="14" cy="10" r="6.25" />
              <path d="M9.2 14.8 3.5 20.5" />
            </svg>
          </span>
          <input
            aria-label="Search storefronts"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <div className="topbar-right" aria-hidden={!loading}>
          {loading && <span className="muted">Searching…</span>}
        </div>
      </header>

      <FilterBar filters={filters ?? emptyFilters()} onApply={applyFilters} />

      <div className="workspace">
        <aside className="rail">
          <div className="rail-head">
            <strong>{listTitle}</strong>
            {persona !== "shop_owner" && (
              <select aria-label="Sort results" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="turnover">Turnover</option>
                <option value="fit">Fit</option>
                <option value="name">Address</option>
              </select>
            )}
          </div>

          {persona === "shop_owner" ? (
            <div className="rail-scroll">
              {watchNote && <p className="disclaimer pad">{watchNote}</p>}
              {watches.length === 0 && (
                <p className="empty pad">No watches yet. Open a space from Explore and choose Watch privately.</p>
              )}
              {watches.map((watch) => (
                <div key={watch.propertyId} className="watch-row">
                  <button
                    type="button"
                    className={`result-card${watch.propertyId === selectedId ? " active" : ""}`}
                    onClick={() => openStorefront(watch.propertyId, filters?.category ?? null).catch((caught) => setError(caught.message))}
                  >
                    <StreetThumb id={watch.propertyId} />
                    <span className="result-meta">
                      <b>{titleAddress(watch.address)}</b>
                      <span className="sub">
                        {watch.neighborhood} · T{watch.turnoverScore}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={async () => {
                      await fetch(`/api/owner?sessionId=${sessionId()}&propertyId=${encodeURIComponent(watch.propertyId)}`, { method: "DELETE" });
                      await loadWatches();
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost pad-btn"
                onClick={() => {
                  setPersona("entrepreneur");
                  setMode("explore");
                }}
              >
                Browse more spaces
              </button>
            </div>
          ) : (
            <div className="rail-scroll">
              {error && <p className="error pad">{error}</p>}
              {filtered.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={`result-card${result.id === selectedId ? " active" : ""}`}
                  onClick={() => openStorefront(result.id, filters?.category ?? null).catch((caught) => setError(caught.message))}
                >
                  <StreetThumb id={result.id} />
                  <span className="result-meta">
                    <b>{titleAddress(result.address)}</b>
                    <span className="sub">
                      {result.neighborhood} · T{result.turnoverScore} · F{result.fitScore}
                    </span>
                  </span>
                </button>
              ))}
              {!loading && filtered.length === 0 && (
                <p className="empty pad">No storefronts matched those filters.</p>
              )}
            </div>
          )}
        </aside>

        <section className="map-pane">
          <div className="map-canvas-wrap">
            <MapMetricFilters selected={metricFilters} onChange={setMetricFilters} />
            <MapCanvas
              pins={pins}
              onSelect={(id) => openStorefront(id, filters?.category ?? null).catch((caught) => setError(caught.message))}
            />
          </div>
        </section>

        <aside className="detail-rail">
          <div className="detail-scroll">
            {mode === "gap" && (
              <GapPanel
                neighborhoods={gapNeighborhoods}
                neighborhood={gapNeighborhood}
                onNeighborhood={(name) => loadGap(name, detail?.neighborhood === name ? detail.id : null).catch((caught) => setError(caught.message))}
                gaps={gaps}
                narrative={gapNarrative}
                narrativeSource={gapSource}
                disclaimer={gapDisclaimer}
                nearbyFood={nearbyFood}
              />
            )}
            {mode === "landlord" && (
              <LandlordPanel
                key={selectedId ?? "landlord"}
                options={results}
                selectedId={selectedId}
                onSubmit={async (input) => {
                  const response = await fetch("/api/landlord", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error || "Could not save");
                  await search(query, {
                    keepSelection: true,
                    filters: usingProfile && profile ? profileToFilters(profile) : filters ?? undefined,
                    fromProfile: usingProfile,
                  });
                  return payload.publicSignal as string;
                }}
              />
            )}
            {mode !== "gap" && mode !== "landlord" && detail && (
              <DetailPanel
                detail={detail}
                explanation={explanation}
                busy={explaining}
                showAiSummary={persona === "entrepreneur"}
                onExplain={async () => {
                  setExplaining(true);
                  try {
                    const response = await fetch("/api/explain", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ propertyId: detail.id, category: filters?.category }),
                    });
                    const payload = await response.json();
                    if (!response.ok) throw new Error(payload.error);
                    setExplanation({ text: payload.text, source: payload.source });
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Explanation failed");
                  } finally {
                    setExplaining(false);
                  }
                }}
              />
            )}
            {mode !== "gap" && mode !== "landlord" && !detail && (
              <div className="detail-empty">
                <h2>Select a storefront</h2>
                <p>Click a result or map marker to see turnover evidence, fit, and history.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {onboardingOpen && (
        <Onboarding
          initial={profile}
          onSave={applyProfile}
          onSkip={() => {
            window.localStorage.setItem(PROFILE_SKIP_KEY, "1");
            setOnboardingOpen(false);
            search(EXAMPLE).catch((caught) => setError(caught.message));
          }}
          onClose={profile || persona ? () => setOnboardingOpen(false) : undefined}
        />
      )}
    </main>
  );
}
