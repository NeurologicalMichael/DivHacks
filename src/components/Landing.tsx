"use client";

export type Persona = "entrepreneur" | "shop_owner" | "landlord";

const PERSONAS: { id: Persona; title: string; hint: string }[] = [
  { id: "entrepreneur", title: "Entrepreneur", hint: "Find a space early" },
  { id: "shop_owner", title: "Shop Owner", hint: "Watch my lease risk" },
  { id: "landlord", title: "Landlord", hint: "Signal privately" },
];

export function Landing({ onChoose }: { onChoose: (persona: Persona) => void }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <strong className="logo">LeaseLens</strong>
        <button type="button" className="nav-ghost" aria-label="Account" />
      </header>
      <div className="landing-body">
        <div className="landing-copy">
          <h1>Find the storefront before the listing does</h1>
          <p>
            LeaseLens reads NYC public records to spot commercial spaces that are vacant or likely to open up, and
            shows the evidence behind every score.
          </p>
          <div className="persona-row">
            {PERSONAS.map((persona) => (
              <button key={persona.id} type="button" className="persona-card" onClick={() => onChoose(persona.id)}>
                <b>{persona.title}</b>
                <span>{persona.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="landing-visual" aria-hidden="true" />
      </div>
    </div>
  );
}
