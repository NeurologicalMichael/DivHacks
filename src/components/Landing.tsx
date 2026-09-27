"use client";

import { BrandMark } from "./BrandMark";

export type Persona = "entrepreneur" | "shop_owner" | "landlord";

export function Landing({ onChoose }: { onChoose: (persona: Persona) => void }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <BrandMark />
      </header>
      <div className="landing-body">
        <div className="landing-copy">
          <h1>
            Find the storefront
            <br />
            before the listing does
          </h1>
          <p>
            LeaseLens reads NYC public records to find storefronts that are empty or likely to open up soon, and
            shows you the evidence behind every score.
          </p>
          <button type="button" className="landing-cta" onClick={() => onChoose("entrepreneur")}>
            Find Storefronts
          </button>
        </div>
        <div className="landing-stage" aria-hidden="true">
          <img className="hero-map" src="/homepage1.png" alt="" />
          <p className="hero-chat hero-chat-ask" style={{ animationDelay: "0.2s" }}>
            I want to open a store, but it&apos;s so confusing
            <br />
            to find a storefront that fits
          </p>
          <img className="hero-card hero-gauges" style={{ animationDelay: "0.35s" }} src="/homepage6.png" alt="" />
          <img className="hero-card hero-address" style={{ animationDelay: "0.5s" }} src="/homepage4.png" alt="" />
          <img className="hero-card hero-timeline" style={{ animationDelay: "0.7s" }} src="/homepage2.png" alt="" />
          <img className="hero-card hero-score" style={{ animationDelay: "0.85s" }} src="/homepage3.png" alt="" />
          <img className="hero-card hero-photo" style={{ animationDelay: "1.05s" }} src="/homepage5.png" alt="" />
          <p className="hero-chat hero-chat-why" style={{ animationDelay: "1.25s" }}>
            Why are there so many empty
            <br />
            stores in New York?
          </p>
        </div>
      </div>
    </div>
  );
}
