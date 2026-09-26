"use client";

import { useState } from "react";
import { BOROUGHS } from "@/lib/catalog";
import {
  BEDS,
  COMMERCIAL_BUDGETS,
  COMMERCIAL_MUSTS,
  COMMERCIAL_USES,
  HOME_BUDGETS,
  HOME_MUSTS,
  HOUSEHOLDS,
  LEASE_KINDS,
  PETS,
  SIZE_BANDS,
  TIMINGS,
  emptyDraft,
  neighborhoodsFor,
  stepError,
  wantsCommercial,
  wantsHome,
  type BudgetBand,
  type RenterProfile,
} from "@/lib/profile";

const STEPS = [
  { id: "Lease", title: "What are you looking to lease?", lead: "This is the start of the profile used to rank places." },
  { id: "Space", title: "What does the space need to be?", lead: "One clear choice is enough. Details can wait." },
  { id: "Budget", title: "Budget and timing", lead: "A range is enough. Exact rent is not required." },
  { id: "Place", title: "Where should it be?", lead: "Borough and subway narrow the map. Everything else is saved for ranking." },
];

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function Onboarding({
  initial,
  onSave,
  onSkip,
  onClose,
}: {
  initial: RenterProfile | null;
  onSave: (profile: RenterProfile) => void;
  onSkip?: () => void;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RenterProfile>(initial ?? emptyDraft());
  const [error, setError] = useState("");

  function patch(partial: Partial<RenterProfile>) {
    setDraft((current) => ({ ...current, ...partial }));
    setError("");
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
    onSave({ ...draft, savedAt: new Date().toISOString() });
  }

  const neighborhoods = neighborhoodsFor(draft.boroughs);
  const commercial = wantsCommercial(draft);
  const home = wantsHome(draft);

  const current = STEPS[step];

  return (
    <div className="onboard">
      <article className="onboard-sheet">
        <header className="onboard-head">
          <div className="onboard-progress" aria-hidden="true">
            {STEPS.map((item, index) => (
              <span key={item.id} className={index <= step ? "is-on" : ""} />
            ))}
          </div>
          <p className="onboard-step">{step + 1} / {STEPS.length} · {current.id}</p>
          <h2>{current.title}</h2>
          <p className="onboard-lead">{current.lead}</p>
        </header>

        <div className="onboard-body">
          {step === 0 && (
            <div className="onboard-grid onboard-grid-wide">
              {LEASE_KINDS.map((kind) => (
                <button key={kind.id} type="button" className={draft.leaseKind === kind.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ leaseKind: kind.id, budget: null, homeBudget: null })}>
                  <b>{kind.label}</b>
                  <span>{kind.hint}</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="onboard-sections">
              {commercial && (
                <section>
                  <p className="onboard-label">Business use</p>
                  <div className="onboard-grid">
                    {COMMERCIAL_USES.map((use) => (
                      <button key={use.id} type="button" className={draft.use === use.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ use: use.id })}>{use.label}</button>
                    ))}
                  </div>
                  <input
                    aria-label="What you are opening"
                    placeholder="Optional: what you are opening"
                    value={draft.concept}
                    maxLength={80}
                    onChange={(event) => patch({ concept: event.target.value })}
                  />
                </section>
              )}
              {home && (
                <section>
                  <p className="onboard-label">Home</p>
                  <div className="onboard-grid">
                    {BEDS.map((beds) => (
                      <button key={beds.id} type="button" className={draft.beds === beds.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ beds: beds.id })}>{beds.label}</button>
                    ))}
                  </div>
                  <div className="onboard-grid">
                    {HOUSEHOLDS.map((item) => (
                      <button key={item.id} type="button" className={draft.household === item.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ household: item.id })}>{item.label}</button>
                    ))}
                  </div>
                  <div className="onboard-grid">
                    {PETS.map((item) => (
                      <button key={item.id} type="button" className={draft.pets === item.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ pets: item.id })}>{item.label}</button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="onboard-sections">
              {commercial && (
                <section>
                  <p className="onboard-label">Maximum business rent</p>
                  <div className="onboard-grid">
                    {COMMERCIAL_BUDGETS.map((band) => (
                      <button key={band.id} type="button" className={draft.budget === band.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ budget: band.id })}>{band.label}</button>
                    ))}
                  </div>
                </section>
              )}
              {commercial && (
                <section>
                  <p className="onboard-label">Size</p>
                  <div className="onboard-grid">
                    {SIZE_BANDS.map((band) => (
                      <button key={band.id} type="button" className={draft.size === band.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ size: band.id })}>{band.label}</button>
                    ))}
                  </div>
                </section>
              )}
              {home && (
                <section>
                  <p className="onboard-label">Maximum home rent</p>
                  <div className="onboard-grid">
                    {HOME_BUDGETS.map((band) => {
                      const selected = draft.leaseKind === "both" ? draft.homeBudget === band.id : draft.budget === band.id;
                      return (
                        <button
                          key={band.id}
                          type="button"
                          className={selected ? "onboard-option is-on" : "onboard-option"}
                          onClick={() => patch(draft.leaseKind === "both" ? { homeBudget: band.id as BudgetBand } : { budget: band.id })}
                        >
                          {band.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              <section>
                <p className="onboard-label">When you need it</p>
                <div className="onboard-grid">
                  {TIMINGS.map((timing) => (
                    <button key={timing.id} type="button" className={draft.timing === timing.id ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ timing: timing.id })}>{timing.label}</button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {step === 3 && (
            <div className="onboard-sections">
              <section>
                <p className="onboard-label">Boroughs</p>
                <div className="onboard-grid">
                  {BOROUGHS.map((borough) => (
                    <button
                      key={borough}
                      type="button"
                      className={draft.boroughs.includes(borough) ? "onboard-option is-on" : "onboard-option"}
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
                <p className="onboard-label">Neighborhoods, if you already know</p>
                <div className="onboard-grid">
                  {neighborhoods.map((name) => (
                    <button key={name} type="button" className={draft.neighborhoods.includes(name) ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ neighborhoods: toggle(draft.neighborhoods, name) })}>{name}</button>
                  ))}
                </div>
                {neighborhoods.length === 0 && <p className="onboard-lead">Choose a borough in this sample, or continue with the borough only.</p>}
              </section>
              <section>
                <p className="onboard-label">Subway</p>
                <div className="onboard-grid onboard-grid-pair">
                  <button type="button" className={draft.nearSubway === true ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ nearSubway: true })}>Near a subway</button>
                  <button type="button" className={draft.nearSubway === false ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ nearSubway: false })}>No preference</button>
                </div>
              </section>
              <section>
                <p className="onboard-label">Must-haves to save</p>
                <div className="onboard-grid">
                  {(commercial ? COMMERCIAL_MUSTS : []).concat(home ? HOME_MUSTS : []).map((item) => (
                    <button key={item.id} type="button" className={draft.mustHaves.includes(item.id) ? "onboard-option is-on" : "onboard-option"} onClick={() => patch({ mustHaves: toggle(draft.mustHaves, item.id) })}>{item.label}</button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {error && <p className="onboard-error">{error}</p>}
        <footer className="onboard-foot">
          {step > 0 ? (
            <button type="button" className="ghost" onClick={() => { setStep(step - 1); setError(""); }}>Back</button>
          ) : onClose ? (
            <button type="button" className="ghost" onClick={onClose}>Close</button>
          ) : (
            <button type="button" className="ghost" onClick={onSkip}>Skip for now</button>
          )}
          <button type="button" className="primary" onClick={next}>{step === STEPS.length - 1 ? "See matches" : "Continue"}</button>
        </footer>
      </article>
    </div>
  );
}
