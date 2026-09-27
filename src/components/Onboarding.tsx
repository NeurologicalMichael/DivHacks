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
  { title: "Question 1", lead: "What are you looking to lease?", category: "Lease type" },
  { title: "Question 2", lead: "What does the space need to be?", category: "Category" },
  { title: "Question 3", lead: "Budget and timing for this search.", category: "Budget" },
  { title: "Question 4", lead: "Where should LeaseLens look first?", category: "Place" },
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
          <h2>{current.title}</h2>
          <p className="onboard-lead">{current.lead}</p>
        </header>

        <div className="onboard-body">
          {step === 0 && (
            <section>
              <p className="onboard-label">{current.category}</p>
              <div className="onboard-pills">
                {LEASE_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    className={draft.leaseKind === kind.id ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => patch({ leaseKind: kind.id, budget: null, homeBudget: null })}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
              <p className="onboard-hint">
                {LEASE_KINDS.find((k) => k.id === draft.leaseKind)?.hint ?? "Pick one to continue."}
              </p>
            </section>
          )}

          {step === 1 && (
            <div className="onboard-sections">
              {commercial && (
                <section>
                  <p className="onboard-label">Category</p>
                  <div className="onboard-pills">
                    {COMMERCIAL_USES.map((use) => (
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
              )}
              {home && (
                <section>
                  <p className="onboard-label">Home</p>
                  <div className="onboard-pills">
                    {BEDS.map((beds) => (
                      <button
                        key={beds.id}
                        type="button"
                        className={draft.beds === beds.id ? "onboard-pill is-on" : "onboard-pill"}
                        onClick={() => patch({ beds: beds.id })}
                      >
                        {beds.label}
                      </button>
                    ))}
                  </div>
                  <div className="onboard-pills">
                    {HOUSEHOLDS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={draft.household === item.id ? "onboard-pill is-on" : "onboard-pill"}
                        onClick={() => patch({ household: item.id })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="onboard-pills">
                    {PETS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={draft.pets === item.id ? "onboard-pill is-on" : "onboard-pill"}
                        onClick={() => patch({ pets: item.id })}
                      >
                        {item.label}
                      </button>
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
              )}
              {commercial && (
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
              )}
              {home && (
                <section>
                  <p className="onboard-label">Maximum home rent</p>
                  <div className="onboard-pills">
                    {HOME_BUDGETS.map((band) => {
                      const selected = draft.leaseKind === "both" ? draft.homeBudget === band.id : draft.budget === band.id;
                      return (
                        <button
                          key={band.id}
                          type="button"
                          className={selected ? "onboard-pill is-on" : "onboard-pill"}
                          onClick={() =>
                            patch(draft.leaseKind === "both" ? { homeBudget: band.id as BudgetBand } : { budget: band.id })
                          }
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
            </div>
          )}

          {step === 3 && (
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
                {neighborhoods.length === 0 && (
                  <p className="onboard-hint">Choose a borough first, or continue with borough only.</p>
                )}
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
                    className={draft.nearSubway === false ? "onboard-pill is-on" : "onboard-pill"}
                    onClick={() => patch({ nearSubway: false })}
                  >
                    No preference
                  </button>
                </div>
              </section>
              <section>
                <p className="onboard-label">Must-haves</p>
                <div className="onboard-pills">
                  {(commercial ? COMMERCIAL_MUSTS : [])
                    .concat(home ? HOME_MUSTS : [])
                    .map((item) => (
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
            </div>
          )}
        </div>

        {error && <p className="onboard-error">{error}</p>}
        <footer className="onboard-foot">
          {step > 0 ? (
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
          ) : (
            <button
              type="button"
              className="onboard-secondary"
              onClick={() => {
                if (onSkip) onSkip();
                else onClose?.();
              }}
            >
              Skip for now
            </button>
          )}
          <button type="button" className="onboard-primary" onClick={next}>
            Continue
          </button>
        </footer>
      </article>
    </div>
  );
}
