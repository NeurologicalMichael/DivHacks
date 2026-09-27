# LeaseLens NYC

Find the storefront before the listing does.

LeaseLens is a map-first search for entrepreneurs looking at New York City storefronts. It combines public city filings into a turnover index and a business-fit index, and it shows the evidence under every number.

## Run

PostgreSQL 16 with PostGIS and TimescaleDB (Tiger Data's database engine) needs to be reachable. The Docker container `leaselens-db` publishes it on **`localhost:5433`** (host `5432` is often already taken by another Postgres).

```bash
npm install
# ensure the container is up, e.g. docker start leaselens-db
npm run db:setup
npm run dev
```

The database URL defaults to `postgres://leaselens:leaselens@localhost:5433/leaselens`. Override it with `DATABASE_URL`.

Optional: set `GEMINI_API_KEY` to let Gemini turn a sentence into filters and summarize records that were already retrieved. Without a key, a local parser handles the same searches and the on-screen explanations are templates built only from those records.

Optional: set `MAPILLARY_TOKEN` to a free client token from the [Mapillary developer dashboard](https://www.mapillary.com/dashboard/developers). No credit card. When a sidewalk photo exists within 50 meters of the storefront, it appears in the list thumbnail and on the detail panel, with CC BY-SA credit on the detail. Without a token, or when Mapillary has no nearby photo, the thumbnail stays empty and the panel says so. These are street-level photos, not interiors.

Optional: set `NEXT_PUBLIC_CARTO_API_KEY` to your [CARTO](https://carto.com/) basemap API key for the light map tiles. Without it, the map falls back to Esri’s light-gray basemap (no key). Restart `npm run dev` after changing any `NEXT_PUBLIC_*` variable.

Try: “Show me restaurant-ready storefronts in Brooklyn that may become available in the next 6 months.”

## What the data is

| Kind | What you see |
| --- | --- |
| City record | Storefront Registry vacancies, activity, sale dates, and lease dates when the filing includes `expir_dt_of_most_recent_lease`. DOB NOW jobs, DCWP licenses, DOF rolling sales, PLUTO, MTA stations, DOT bi-annual pedestrian counts, DOHMH restaurants. |
| Derived | Turnover index, fit index, tenant-activity changes, neighborhood commercial-sale medians, and Gap Finder comparisons. Each piece names its source. |
| Not filled in | Lease dates that are absent from the filing. Census ACS income, because `api.census.gov` required a key that was not configured. |
| Demo | Three landlord opt-ins labeled demo, so that workflow is visible. Opt-ins you submit are stored for real and stay anonymous on the public map. |

Permits, licenses, sales, and PLUTO are joined on the tax lot, not a confirmed storefront unit. Vacancy counts toward a “next 6 months” search only when the latest filing is reporting year 2024 or 2025. Food-supply comparisons use DOHMH restaurant locations because the registry’s `FOOD SERVICES` label is too sparse to treat as a census of restaurants.

The map is a stratified sample of opportunity filings, not every storefront in the city. Neighborhood vacancy and retail shares for the twelve Brooklyn neighborhoods are full 2023/2024 registry counts.

Refresh the extract with `npm run fetch-data`, then `npm run db:setup`. `data/snapshot.json` is the copy the app loads so the demo still runs if those APIs are slow.

The Lease desk is the SpaceXAI agent. It is closed until the browser saves a name, business, and reply-to email. Google sign-in is not connected. The desk calls `https://api.x.ai/v1/responses` when `XAI_API_KEY` is set, shows each filing lookup as it happens, and drafts a note only from those filings. Approving a note stores it. Nothing is emailed, because no mail service is connected. If the key is missing or SpaceXAI rejects the call, the same desk answers from the filing search.

## Scoring

Turnover points are assigned in `sql/schema.sql` by `refresh_signals()` from stored rows only: reported vacancy, a lease date that actually falls in a near-term window, a DOF or registry sale, construction reported on the filing, a recent DOB job, a lapsed DCWP license, an activity change across filings, a neighborhood sale-median increase, and a landlord opt-in. The total is capped at 100.

`fit_components()` scores a requested use from the storefront filing, subway distance, and PLUTO class, retail area, and zoning when those fields matched. Missing fields add zero and say they were not matched.
