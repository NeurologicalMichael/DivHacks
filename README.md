# LeaseLens NYC

Find the storefront before the listing does.

LeaseLens is a map-first search for entrepreneurs looking at New York City storefronts. It pulls public city filings into two scores — **Store Score** (how much turnover evidence is on file) and **Fit** (how well the lot matches a requested use) — and shows the source under every number.

## Run

You need PostgreSQL 16 with PostGIS and TimescaleDB. The Docker container `leaselens-db` usually publishes it on **`localhost:5433`** (host port `5432` is often already taken by another Postgres).

```bash
npm install
docker start leaselens-db   # if the container already exists
npm run db:setup            # load schema + data/snapshot.json
npm run dev                 # http://localhost:3000
```

Default connection string:

`postgres://leaselens:leaselens@localhost:5433/leaselens`

Override with `DATABASE_URL`. Copy `.env.example` to `.env` or `.env.local`. Restart `npm run dev` after changing any `NEXT_PUBLIC_*` variable.

### Optional keys

| Variable | What it does |
| --- | --- |
| `GEMINI_API_KEY` | Turns a natural-language sentence into filters and summarizes records already retrieved. Without it, a local parser handles search and on-screen explanations use templates built only from those records. |
| `MAPILLARY_TOKEN` | Free client token from the [Mapillary developer dashboard](https://www.mapillary.com/dashboard/developers) (no credit card). When a sidewalk photo exists within ~50 m of the pin, it shows in the list thumbnail and detail panel (CC BY-SA credit on detail). No token or no nearby photo → empty thumbnail. Street-level only, not interiors. |
| `NEXT_PUBLIC_CARTO_API_KEY` | CARTO light basemap tiles. Without it, the map falls back to Esri’s light-gray basemap (no key). |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in for the Lease desk. Create a free Web OAuth client, set authorized JavaScript origin to `http://localhost:3000`, and use Email / Profile / OpenID scopes. If the consent screen is in testing, add each Google account as a test user (or publish the app). No billing and no client secret. |
| `XAI_API_KEY` | SpaceXAI desk (`https://api.x.ai/v1/responses`). Without it, or if the call is rejected, the same desk answers from filing search only. |

Try: *“Show me restaurant-ready storefronts in Brooklyn that may become available in the next 6 months.”*

## What the data is

| Kind | What you see |
| --- | --- |
| City record | Storefront Registry vacancies, activity, sale dates, and lease dates when the filing includes `expir_dt_of_most_recent_lease`. DOB NOW jobs, DCWP licenses, DOF rolling sales, PLUTO, MTA stations, DOT bi-annual pedestrian counts, DOHMH restaurants. |
| Derived | Store Score, Fit, tenant-activity changes across filings, neighborhood commercial-sale medians, and Gap Finder comparisons. Each piece names its source. |
| Not filled in | Lease dates absent from the filing. Census ACS income (`api.census.gov` needed a key that was not configured). |
| Demo | Three landlord opt-ins labeled demo so that workflow is visible. Opt-ins you submit are stored for real and stay anonymous on the public map. |

### How joins and filters work

- Permits, licenses, sales, and PLUTO are joined on the **tax lot (BBL)**, not a confirmed storefront unit. Treat lot-level matches as evidence on the building, not proof of a specific ground-floor space.
- Vacancy counts toward a “next 6 months” search only when the latest filing is reporting year **2024 or 2025**.
- Food-supply / restaurant comparisons use **DOHMH** restaurant locations. The registry’s `FOOD SERVICES` label is too sparse to treat as a census of restaurants.
- The map is a **stratified sample** of opportunity filings, not every storefront in the city. Neighborhood vacancy and retail shares for the twelve Brooklyn neighborhoods are full 2023/2024 registry counts.
- Timeline rows use **when the record was filed or issued** as the primary date. Lease ends and license expirations stay on file as subject dates (so an Active DCWP license issued in 2024 can still show expiration in 2027 without floating to the top of the timeline).

### Refreshing the extract

```bash
npm run fetch-data   # scripts/fetch_snapshot.py + enrich_snapshot.py
npm run db:setup     # reload into Postgres
```

`data/snapshot.json` is the copy the app loads so the demo still runs when Open Data APIs are slow. If subject dates were ever stored as `occurred_at` (future timeline dates), repair with:

`node scripts/repair_timeline_dates.mjs`

## Scoring

### Store Score

Store Score is the sum of public-record **signal weights** that apply to a property. It is **not capped at 100** — more coincident evidence simply raises the total. Gauges and map colors still treat ~100 as a strong high end for display; the numeric score can go higher.

Signals are assigned in `sql/schema.sql` by `refresh_signals()` from stored rows only:

| Signal | Typical meaning |
| --- | --- |
| Reported vacancy | Registry vacant on Dec 31 and/or Jun 30 (or date sold) |
| Lease date on file | `expir_dt_of_most_recent_lease` falls in a near-term window |
| DOF / registry sale | Recent building sale on the lot |
| Construction on filing | Owner reported construction activity |
| Recent DOB job | DOB NOW filing on the lot |
| Lapsed DCWP license | Expired business license joined on the tax lot |
| Activity change | Tenant activity shifted across filings |
| Sale-median rise | Neighborhood commercial sale median moved up |
| Landlord opt-in | Owner marked interest (demo or live) |

Default weights live in the schema and in `src/lib/signals.ts`. **Customize signals** in the app changes weights for the session (stored in the browser); they apply to every property’s Store Score breakdown.

### Fit

`fit_components()` scores a requested use from the storefront filing, subway distance, and PLUTO building class, retail area, and zoning when those fields matched. Missing fields add **zero** and say they were not matched. Fit is a 0–100 style index used for ranking against a chosen category (e.g. restaurant, retail).

## Lease desk

The Lease desk is the SpaceXAI agent. It stays closed until there is an account:

1. Continue with Google (or type a name/email — that path stays in this browser only).
2. Add the business name; Google accounts are stored in `user_accounts`.

With `XAI_API_KEY` set, the desk calls SpaceXAI, shows each filing lookup as it happens, and drafts a note **only from those filings**. Approving a note stores it. Nothing is emailed — no mail service is connected. If the key is missing or SpaceXAI rejects the call, the same desk answers from the filing search.
