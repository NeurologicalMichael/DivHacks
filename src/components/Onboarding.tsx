"use client";

import { useState } from "react";
import { BOROUGHS, CATEGORIES, NEIGHBORHOODS } from "@/lib/catalog";
import {
  COMMERCIAL_BUDGETS,
  COMMERCIAL_MUSTS,
  SIZE_BANDS,
  TIMINGS,
  emptyDraft,
  neighborhoodsFor,
  stepError,
  type RenterProfile,
} from "@/lib/profile";

const STEPS = [
  { title: "Question 1", lead: "What kind of storefront should LeaseLens look for?" },
  { title: "Question 2", lead: "Budget, size, and when you need the space." },
  { title: "Question 3", lead: "Where should the search look, and what else matters?" },
];

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function storefrontDraft(initial: RenterProfile | null): RenterProfile {
  const base = initial ?? emptyDraft();
  return {
    ...base,
    leaseKind: "commercial",
    beds: null,
    household: null,
    pets: null,
    homeBudget: null,
  };
}

export function Onboarding({
  initial,
  onSave,
  onSkip,
}: {
  initial: RenterProfile | null;
  onSave: (profile: RenterProfile, extras: { vacantOnly: boolean; minTurnover: number }) => void;
  onSkip?: () => void;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RenterProfile>(() => storefrontDraft(initial));
  const [vacantOnly, setVacantOnly] = useState(false);
  const [minTurnover, setMinTurnover] = useState(0);
  const [error, setError] = useState("");

  function patch(partial: Partial<RenterProfile>) {
    setDraft((current) => ({ ...current, ...partial }));
    setError("");
  }

  function finish() {
    onSave(
      { ...draft, leaseKind: "commercial", savedAt: new Date().toISOString() },
      { vacantOnly, minTurnover },
    );
  }

  function next() {
    const problem = stepError(draft, step);
    if (problem) {
      setError(problem);
      return;
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    finish();
  }

  const neighborhoods = draft.boroughs.length ? neighborhoodsFor(draft.boroughs) : [...NEIGHBORHOODS];
  const current = STEPS[step];

  return (
    <div className="onboard">
      <article className="onboard-sheet" onClick={(event) => event.stopPropagation()}>
        <header className="onboard-head">
          <h2>{current.title}</h2>
          <p className="onboard-lead">{current.lead}</p>
        </header>

        <div className="onboard-body">
          {step === 0 && (
            <div className="onboard-sections">
              <section>
                <p className="onboard-label">Business use</p>
                <div className="onboard-pills">
                  <button
                    type="button"
                    className={draft.use == null ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => patch({ use: null })}
                  >
                    Any storefront
                  </button>
                  {CATEGORIES.map((use) => (
                    <button
                      key={use.id}
                      type="button"
                      className={draft.use === use.id ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => patch({ use: use.id })}
                    >
                      {use.label}
                    </button>
                  ))}
                </div>
                <input
                  className="onboard-input"
                  aria-label="What you are opening"
                  placeholder="Optional: what you are opening"
                  value={draft.concept}
                  maxLength={80}
                  onChange={(event) => patch({ concept: event.target.value })}
                />
              </section>
            </div>
          )}

          {step === 1 && (
            <div className="onboard-sections">
              <section>
                <p className="onboard-label">Maximum rent</p>
                <div className="onboard-pills">
                  {COMMERCIAL_BUDGETS.map((band) => (
                    <button
                      key={band.id}
                      type="button"
                      className={draft.budget === band.id ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => patch({ budget: band.id })}
                    >
                      {band.label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <p className="onboard-label">Size</p>
                <div className="onboard-pills">
                  {SIZE_BANDS.map((band) => (
                    <button
                      key={band.id}
                      type="button"
                      className={draft.size === band.id ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => patch({ size: band.id })}
                    >
                      {band.label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <p className="onboard-label">When you need it</p>
                <div className="onboard-pills">
                  {TIMINGS.map((timing) => (
                    <button
                      key={timing.id}
                      type="button"
                      className={draft.timing === timing.id ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => patch({ timing: timing.id })}
                    >
                      {timing.label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <p className="onboard-label">Vacancy</p>
                <div className="onboard-pills">
                  <button
                    type="button"
                    className={vacantOnly ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => setVacantOnly(true)}
                  >
                    Vacant filings only
                  </button>
                  <button
                    type="button"
                    className={!vacantOnly ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => setVacantOnly(false)}
                  >
                    Any filing
                  </button>
                </div>
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="onboard-sections">
              <section>
                <p className="onboard-label">Boroughs</p>
                <div className="onboard-pills">
                  {BOROUGHS.map((borough) => (
                    <button
                      key={borough}
                      type="button"
                      className={draft.boroughs.includes(borough) ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => {
                        const boroughs = toggle(draft.boroughs, borough);
                        const allowed = new Set<string>(neighborhoodsFor(boroughs));
                        patch({
                          boroughs,
                          neighborhoods: draft.neighborhoods.filter((name) => allowed.has(name)),
                        });
                      }}
                    >
                      {borough}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <p className="onboard-label">Neighborhoods</p>
                <div className="onboard-pills">
                  {neighborhoods.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={draft.neighborhoods.includes(name) ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => patch({ neighborhoods: toggle(draft.neighborhoods, name) })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <p className="onboard-label">Subway</p>
                <div className="onboard-pills">
                  <button
                    type="button"
                    className={draft.nearSubway === true ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => patch({ nearSubway: true })}
                  >
                    Near a subway
                  </button>
                  <button
                    type="button"
                    className={draft.nearSubway !== true ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => patch({ nearSubway: false })}
                  >
                    No preference
                  </button>
                </div>
              </section>
              <section>
                <p className="onboard-label">Must-haves</p>
                <div className="onboard-pills">
                  {COMMERCIAL_MUSTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={draft.mustHaves.includes(item.id) ? "onboard-pill is-on" : "onboard-pill"}
                      onClick={() => patch({ mustHaves: toggle(draft.mustHaves, item.id) })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <p className="onboard-label">Minimum Store Score</p>
                <input
                  className="onboard-input"
                  type="number"
                  min={0}
                  max={100}
                  aria-label="Minimum Store Score"
                  placeholder="0"
                  value={minTurnover || ""}
                  onChange={(event) => {
                    const next = event.target.value === "" ? 0 : Math.min(100, Math.max(0, Number(event.target.value)));
                    setMinTurnover(Number.isFinite(next) ? next : 0);
                  }}
                />
              </section>
            </div>
          )}
        </div>

        {error && <p className="onboard-error">{error}</p>}
        <footer className="onboard-foot">
          <button type="button" className="onboard-skip" onClick={() => onSkip?.()}>
            Skip for now
          </button>
          <div className="onboard-foot-actions">
            {step > 0 && (
              <button
                type="button"
                className="onboard-secondary"
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                Back
              </button>
            )}
            <button type="button" className="onboard-primary" onClick={next}>
              {step < STEPS.length - 1 ? "Continue" : "See storefronts"}
            </button>
          </div>
        </footer>
      </article>
    </div>
  );
}
