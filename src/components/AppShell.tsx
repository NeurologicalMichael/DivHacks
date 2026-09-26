"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { categoryLabel } from "@/lib/catalog";
import { provenanceLabel, titleAddress } from "@/lib/format";
import {
  PROFILE_SKIP_KEY,
  loadProfile,
  profileHeadline,
  profileLimits,
  profileNotes,
  profileRank,
  profileSentence,
  profileToFilters,
  saveProfile,
  type RenterProfile,
} from "@/lib/profile";
import type { Gap, SearchFilters, StorefrontDetail, Summary } from "@/lib/types";
import type { Pin } from "./MapCanvas";
import { DetailPanel } from "./DetailPanel";
import { GapPanel } from "./GapPanel";
import { LandlordPanel } from "./LandlordPanel";
import { Onboarding } from "./Onboarding";
import { OwnerPanel, type Watch } from "./OwnerPanel";

const EXAMPLE = "Show me restaurant-ready storefronts in Brooklyn that may become available in the next 6 months.";
const SUGGESTIONS = [
  EXAMPLE,
  "Vacant retail in Williamsburg",
  "High turnover near subway in Park Slope",
  "Grocery in Bushwick",
];

type Mode = "explore" | "gap" | "owner" | "landlord";
type Health = {
  ok?: boolean;
  properties?: number;
  timescaledb?: string;
  postgis?: string;
  gemini?: boolean;
  hypertables?: number;
};

function sessionId() {
  const key = "leaselens-session";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export function AppShell({ MapCanvas }: { MapCanvas: ComponentType<{ pins: Pin[]; onSelect: (id: string) => void }> }) {
  const [mode, setMode] = useState<Mode>("explore");
  const [query, setQuery] = useState(EXAMPLE);
  const [filters, setFilters] = useState<SearchFilters | null>(null);
  const [results, setResults] = useState<Summary[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [interpreter, setInterpreter] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StorefrontDetail | null>(null);
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
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

  const search = useCallback(async (nextQuery: string, keepMode = false, options?: { filters?: Partial<SearchFilters>; fromProfile?: boolean }) => {
    setLoading(true);
    setError("");
    if (!keepMode) {
      setSelectedId(null);
      setDetail(null);
      setExplanation(null);
      setMode("explore");
    }
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery, summarize: true, filters: options?.filters }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed");
      setResults(payload.results);
      setFilters(payload.filters);
      setInterpretation(payload.interpretation);
      setInterpreter(payload.interpreter);
      setSummary(payload.summary);
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
    setMode("explore");
    const response = await fetch(`/api/storefronts/${encodeURIComponent(id)}?category=${encodeURIComponent(category ?? "storefront")}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load storefront");
    setDetail(payload);
  }, []);

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
    fetch("/api/health").then((response) => response.json()).then(setHealth).catch(() => setHealth(null));
    fetch("/api/gap").then((response) => response.json()).then((payload) => {
      setGapNeighborhoods(payload.neighborhoods ?? []);
    }).catch(() => undefined);
    const saved = loadProfile();
    if (saved) {
      setProfile(saved);
      const sentence = profileSentence(saved);
      setQuery(sentence);
      search(sentence, false, { filters: profileToFilters(saved), fromProfile: true }).catch(() => undefined);
      return;
    }
    if (window.localStorage.getItem(PROFILE_SKIP_KEY) === "1") {
      search(EXAMPLE).catch(() => undefined);
      return;
    }
    setOnboardingOpen(true);
  }, [search]);

  const ranked = useMemo(
    () => (usingProfile && profile ? [...results].sort((a, b) => profileRank(profile, b) - profileRank(profile, a)) : results),
    [results, profile, usingProfile],
  );

  function applyProfile(next: RenterProfile) {
    saveProfile(next);
    window.localStorage.removeItem(PROFILE_SKIP_KEY);
    setProfile(next);
    setOnboardingOpen(false);
    const sentence = profileSentence(next);
    setQuery(sentence);
    search(sentence, false, { filters: profileToFilters(next), fromProfile: true }).catch((caught) => setError(caught.message));
  }

  const pins = useMemo<Pin[]>(
    () => results.map((result) => ({
      id: result.id,
      lng: result.lng,
      lat: result.lat,
      turnover: result.turnoverScore,
      active: result.id === selectedId,
    })),
    [results, selectedId],
  );

  return (
    <main className="shell">
      <MapCanvas pins={pins} onSelect={(id) => openStorefront(id, filters?.category ?? null).catch((caught) => setError(caught.message))} />
      <aside className="legend">
        <strong>Turnover index</strong>
        <div className="swatch"><i style={{ background: "#c2512a" }} /> 55–100, more evidence</div>
        <div className="swatch"><i style={{ background: "#6d5844" }} /> 35–54</div>
        <div className="swatch"><i style={{ background: "#1b1714" }} /> Under 35</div>
        <p>The number is a derived index, not the chance a space will list.</p>
      </aside>
      <aside className="status">
        {health?.ok
          ? `Tiger Data ${health.timescaledb} · PostGIS · ${health.properties ?? 0} storefronts${health.gemini ? " · Gemini on" : " · Gemini key not set"}`
          : "Connecting to the database…"}
      </aside>
      <section className="panel">
        <header className="brand">
          <div className="mark" aria-hidden="true"><span /></div>
          <div>
            <h1>LeaseLens</h1>
            <p>Find the storefront before the listing does.</p>
          </div>
        </header>
        <div className="profile-note">
          <button type="button" className="back" onClick={() => setOnboardingOpen(true)}>
            {profile ? "Edit profile" : "Build a profile"}
          </button>
        </div>
        <div className="modes">
          {(["explore", "gap", "owner", "landlord"] as Mode[]).map((item) => (
            <button key={item} className={mode === item ? "active" : ""} onClick={() => {
              setMode(item);
              if (item === "owner") loadWatches().catch((caught) => setError(caught.message));
              if (item === "gap") {
                loadGap(detail?.neighborhood || gapNeighborhood, detail?.id).catch((caught) => setError(caught.message));
              }
            }}>
              {item === "explore" ? "Explore" : item === "gap" ? "Gaps" : item === "owner" ? "Owner" : "Landlord"}
            </button>
          ))}
        </div>
        <form className="search" onSubmit={(event) => { event.preventDefault(); search(query); }}>
          <input aria-label="Search storefronts" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="submit" disabled={loading}>{loading ? "…" : "Search"}</button>
        </form>
        <div className="chips">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); search(suggestion); }}>{suggestion === EXAMPLE ? "Brooklyn, restaurant, 6 months" : suggestion}</button>
          ))}
        </div>
        {mode === "explore" && !detail && (
          <>
            {interpretation && <p className="interpretation">{interpretation}</p>}
            <p className="meta-line">
              {interpreter === "gemini" ? "Filters read by Gemini, then queried in PostGIS." : "Filters read locally, then queried in PostGIS."}
              {filters?.category ? ` Fit index uses ${categoryLabel(filters.category)}.` : ""}
            </p>
            {usingProfile && profile && (
              <div className="summary-note">
                <strong>{profileHeadline(profile)}</strong>
                <p className="disclaimer">{profileLimits(profile)}{profile.concept ? ` Concept: ${profile.concept}.` : ""}</p>
              </div>
            )}
            {summary && <div className="summary-note"><strong>Gemini, from the matched rows.</strong> {summary}</div>}
            {error && <p className="error" style={{ margin: "0 18px" }}>{error}</p>}
          </>
        )}
        <div className="panel-scroll">
          {mode === "explore" && !detail && ranked.map((result, index) => (
            <button className={`card${result.id === selectedId ? " active" : ""}`} style={{ animationDelay: `${index * 0.03}s` }} key={result.id} onClick={() => openStorefront(result.id, filters?.category ?? null).catch((caught) => setError(caught.message))}>
              <div className="card-top">
                <div>
                  <h2 className="address">{titleAddress(result.address)}</h2>
                  <div className="sub">{result.neighborhood} · {result.borough} · filing {result.reportingYear}</div>
                </div>
                <div className="scores">
                  <div className="score-pair"><b>{result.turnoverScore}</b><span>Turnover</span></div>
                  <div className="score-pair"><b>{result.fitScore}</b><span>{categoryLabel(result.fitCategory)}</span></div>
                </div>
              </div>
              <p className="avail">{result.availability.label}</p>
              {usingProfile && profile && profileNotes(profile, result).length > 0 && (
                <p className="disclaimer">{profileNotes(profile, result).join(" · ")}</p>
              )}
              <div className="signal-row">
                {result.topSignals.map((signal) => (
                  <span className="pill" key={signal.label}>{signal.label} · {provenanceLabel(signal.provenance)}</span>
                ))}
              </div>
            </button>
          ))}
          {mode === "explore" && !detail && !loading && results.length === 0 && <p className="empty">No storefronts matched those filters. The records loaded for this demo are a sample of opportunity filings, not every space in the city.</p>}
          {mode === "explore" && detail && (
            <DetailPanel
              detail={detail}
              explanation={explanation}
              busy={explaining}
              onBack={() => { setDetail(null); setSelectedId(null); }}
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
              onGap={() => {
                setMode("gap");
                loadGap(detail.neighborhood, detail.id).catch((caught) => setError(caught.message));
              }}
              onWatch={async () => {
                await fetch("/api/owner", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: sessionId(), propertyId: detail.id }),
                });
                await loadWatches();
                setMode("owner");
              }}
              onLandlord={() => setMode("landlord")}
            />
          )}
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
          {mode === "owner" && (
            <OwnerPanel
              watches={watches}
              note={watchNote}
              onOpen={(id) => openStorefront(id, filters?.category ?? null).catch((caught) => setError(caught.message))}
              onRemove={async (id) => {
                await fetch(`/api/owner?sessionId=${sessionId()}&propertyId=${encodeURIComponent(id)}`, { method: "DELETE" });
                await loadWatches();
              }}
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
                await search(query, true, usingProfile && profile ? { filters: profileToFilters(profile), fromProfile: true } : undefined);
                return payload.publicSignal as string;
              }}
            />
          )}
          <button className="back" onClick={() => setMethodOpen(true)}>How the indexes are built</button>
        </div>
      </section>
      {onboardingOpen && (
        <Onboarding
          initial={profile}
          onSave={applyProfile}
          onSkip={() => {
            window.localStorage.setItem(PROFILE_SKIP_KEY, "1");
            setOnboardingOpen(false);
            search(EXAMPLE).catch((caught) => setError(caught.message));
          }}
          onClose={profile ? () => setOnboardingOpen(false) : undefined}
        />
      )}
      {methodOpen && (
        <div className="method" onClick={() => setMethodOpen(false)}>
          <article onClick={(event) => event.stopPropagation()}>
            <h2>What is real, derived, or demo</h2>
            <p>LeaseLens scores storefronts from public records already stored in Tiger Data. A high index means more of those records are present. It does not mean a space will be listed.</p>
            <ul>
              <li>City records: NYC Storefront Registry vacancies, activity, sale dates, and lease dates when the filing includes them. DOB NOW jobs, DCWP licenses, DOF rolling sales, PLUTO lot attributes, MTA stations, DOT pedestrian counts, and DOHMH restaurants.</li>
              <li>Derived: the turnover index, fit index, activity-change notes, neighborhood sale medians, and gap comparisons. Every component is shown with its source.</li>
              <li>Not invented: missing lease dates stay blank. Census ACS household income is blank because the Census API required a key that was not configured.</li>
              <li>Demo: three anonymous landlord opt-ins are seeded and labeled demo. Anything you submit in Landlord mode is stored as a real opt-in for this database and still hides your note and email.</li>
              <li>Joins on permits, licenses, sales, and PLUTO use the tax lot. They are not confirmed unit matches.</li>
              <li>Food gaps use DOHMH restaurant locations. The registry’s FOOD SERVICES label is too sparse to treat as a census of restaurants.</li>
              <li>Vacancy counts toward “available in the next 6 months” only when the latest filing is reporting year 2024 or 2025.</li>
              <li>SpaceXAI / Photon was not available here, so it is not integrated.</li>
            </ul>
            <button className="primary" onClick={() => setMethodOpen(false)}>Close</button>
          </article>
        </div>
      )}
    </main>
  );
}
