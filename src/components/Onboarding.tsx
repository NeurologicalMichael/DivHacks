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

const STEPS = ["Lease", "Space", "Budget", "Place"];

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

  return (
    <div className="onboard">
      <article>
        <p className="kicker">Profile {step + 1} of {STEPS.length}</p>
        <h2>{step === 0 ? "What are you looking to lease?" : step === 1 ? "What does the space need to be?" : step === 2 ? "Budget and timing" : "Where should it be?"}</h2>
        <p className="disclaimer">
          A few answers build a profile. Place, use, timing, and subway change which storefronts are shown. Budget, bedrooms, pets, and must-haves are saved for classification and are only applied when a filing actually contains that fact.
        </p>

        {step === 0 && (
          <div className="choice-grid">
            {LEASE_KINDS.map((kind) => (
              <button key={kind.id} type="button" className={draft.leaseKind === kind.id ? "choice on" : "choice"} onClick={() => patch({ leaseKind: kind.id, budget: null, homeBudget: null })}>
                <b>{kind.label}</b>
                <span>{kind.hint}</span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            {commercial && (
              <>
                <p className="sub">Business use</p>
                <div className="choice-grid">
                  {COMMERCIAL_USES.map((use) => (
                    <button key={use.id} type="button" className={draft.use === use.id ? "choice on" : "choice"} onClick={() => patch({ use: use.id })}>{use.label}</button>
                  ))}
                </div>
                <input
                  aria-label="What you are opening"
                  placeholder="Optional: what you are opening"
                  value={draft.concept}
                  maxLength={80}
                  onChange={(event) => patch({ concept: event.target.value })}
                />
              </>
            )}
            {home && (
              <>
                <p className="sub">Home</p>
                <div className="choice-grid">
                  {BEDS.map((beds) => (
                    <button key={beds.id} type="button" className={draft.beds === beds.id ? "choice on" : "choice"} onClick={() => patch({ beds: beds.id })}>{beds.label}</button>
                  ))}
                </div>
                <div className="choice-grid">
                  {HOUSEHOLDS.map((item) => (
                    <button key={item.id} type="button" className={draft.household === item.id ? "choice on" : "choice"} onClick={() => patch({ household: item.id })}>{item.label}</button>
                  ))}
                </div>
                <div className="choice-grid">
                  {PETS.map((item) => (
                    <button key={item.id} type="button" className={draft.pets === item.id ? "choice on" : "choice"} onClick={() => patch({ pets: item.id })}>{item.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            {commercial && (
              <>
                <p className="sub">Maximum business rent</p>
                <div className="choice-grid">
                  {COMMERCIAL_BUDGETS.map((band) => (
                    <button key={band.id} type="button" className={draft.budget === band.id ? "choice on" : "choice"} onClick={() => patch({ budget: band.id })}>{band.label}</button>
                  ))}
                </div>
                <p className="sub">Size</p>
                <div className="choice-grid">
                  {SIZE_BANDS.map((band) => (
                    <button key={band.id} type="button" className={draft.size === band.id ? "choice on" : "choice"} onClick={() => patch({ size: band.id })}>{band.label}</button>
                  ))}
                </div>
              </>
            )}
            {home && (
              <>
                <p className="sub">Maximum home rent</p>
                <div className="choice-grid">
                  {HOME_BUDGETS.map((band) => {
                    const selected = draft.leaseKind === "both" ? draft.homeBudget === band.id : draft.budget === band.id;
                    return (
                      <button
                        key={band.id}
                        type="button"
                        className={selected ? "choice on" : "choice"}
                        onClick={() => patch(draft.leaseKind === "both" ? { homeBudget: band.id as BudgetBand } : { budget: band.id })}
                      >
                        {band.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <p className="sub">When you need it</p>
            <div className="choice-grid">
              {TIMINGS.map((timing) => (
                <button key={timing.id} type="button" className={draft.timing === timing.id ? "choice on" : "choice"} onClick={() => patch({ timing: timing.id })}>{timing.label}</button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <p className="sub">Boroughs</p>
            <div className="choice-grid">
              {BOROUGHS.map((borough) => (
                <button
                  key={borough}
                  type="button"
                  className={draft.boroughs.includes(borough) ? "choice on" : "choice"}
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
            <p className="sub">Neighborhoods, if you already know</p>
            <div className="choice-grid">
              {neighborhoods.map((name) => (
                <button key={name} type="button" className={draft.neighborhoods.includes(name) ? "choice on" : "choice"} onClick={() => patch({ neighborhoods: toggle(draft.neighborhoods, name) })}>{name}</button>
              ))}
              {neighborhoods.length === 0 && <p className="disclaimer">Choose a borough that has neighborhoods in this sample, or continue with the borough only.</p>}
            </div>
            <p className="sub">Subway</p>
            <div className="choice-grid">
              <button type="button" className={draft.nearSubway === true ? "choice on" : "choice"} onClick={() => patch({ nearSubway: true })}>Near a subway</button>
              <button type="button" className={draft.nearSubway === false ? "choice on" : "choice"} onClick={() => patch({ nearSubway: false })}>No preference</button>
            </div>
            <p className="sub">Must-haves to save</p>
            <div className="choice-grid">
              {(commercial ? COMMERCIAL_MUSTS : []).concat(home ? HOME_MUSTS : []).map((item) => (
                <button key={item.id} type="button" className={draft.mustHaves.includes(item.id) ? "choice on" : "choice"} onClick={() => patch({ mustHaves: toggle(draft.mustHaves, item.id) })}>{item.label}</button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="actions">
          {step > 0 ? <button type="button" className="ghost" onClick={() => { setStep(step - 1); setError(""); }}>Back</button> : onClose ? <button type="button" className="ghost" onClick={onClose}>Close</button> : <button type="button" className="ghost" onClick={onSkip}>Skip for now</button>}
          <button type="button" className="primary" onClick={next}>{step === STEPS.length - 1 ? "See matches" : "Continue"}</button>
        </div>
      </article>
    </div>
  );
}
