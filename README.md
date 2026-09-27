# LeaseLens NYC

Map-first search for NYC storefronts that may open before a listing appears. Public city filings become a **Store Score** (turnover evidence) and a **Fit** score, with every number tied to a named source.

## Run

Needs PostgreSQL 16 + PostGIS + TimescaleDB. The usual Docker container `leaselens-db` is on **`localhost:5433`** (host `5432` is often taken).

```bash
npm install
docker start leaselens-db   # if needed
npm run db:setup
npm run dev
```

Default DB: `postgres://leaselens:leaselens@localhost:5433/leaselens` (`DATABASE_URL` overrides).

Copy `.env.example` → `.env` / `.env.local`. Restart `npm run dev` after changing any `NEXT_PUBLIC_*` key.

| Variable | Role |
| --- | --- |
| `GEMINI_API_KEY` | Natural-language → filters + record summaries. Without it, a local parser + templates still work. |
| `MAPILLARY_TOKEN` | Free sidewalk photos within ~50 m ([dashboard](https://www.mapillary.com/dashboard/developers)). No card. Missing token or photo → empty thumbnail. |
| `NEXT_PUBLIC_CARTO_API_KEY` | Light basemap tiles; else Esri light-gray (no key). |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in for the Lease desk (Web client, origin `http://localhost:3000`). Testing mode needs each account as a test user. |
| `XAI_API_KEY` | SpaceXAI desk (`api.x.ai`). Without it (or on reject), the desk answers from filing search only. |

Try: *“Restaurant-ready storefronts in Brooklyn that may open in the next 6 months.”*

## Data

| Layer | Contents |
| --- | --- |
| City records | Storefront Registry (vacancy, activity, sale/lease dates when `expir_dt_of_most_recent_lease` is present), DOB NOW jobs, DCWP licenses, DOF rolling sales, PLUTO, MTA stations, DOT pedestrian counts, DOHMH restaurants. |
| Derived | Store Score, Fit, tenant-activity deltas, neighborhood sale medians, Gap Finder. Each cites a source. |
| Gaps | Missing lease fields stay blank. Census ACS income skipped (API key not configured). |
| Demo | Three labeled landlord opt-ins. Live opt-ins are stored and stay anonymous on the map. |

**Joins & caveats**

- Permits, licenses, sales, and PLUTO join on **tax lot**, not a confirmed unit.
- “Next 6 months” vacancy uses latest filings for reporting years **2024–2025** only.
- Food supply uses **DOHMH** locations; registry `FOOD SERVICES` is too sparse to treat as a census.
- The map is a **stratified sample** of opportunity filings, not every storefront. Neighborhood vacancy/retail shares for the twelve Brooklyn NTAs are full 2023/2024 registry counts.
- Timeline dates use **when the record was filed/issued**; lease ends and license expirations appear as subject dates, not as “happened in 2027.”

Refresh extract: `npm run fetch-data`, then `npm run db:setup`. `data/snapshot.json` keeps the demo runnable when Open Data is slow. If timeline subject dates were loaded as `occurred_at`, repair with `node scripts/repair_timeline_dates.mjs`.

## Scoring

**Store Score** (UI label; capped at 100) comes from `refresh_signals()` in `sql/schema.sql` — stored rows only: reported vacancy, near-term lease date on file, DOF/registry sale, construction on filing, recent DOB job, lapsed DCWP license, activity change across filings, neighborhood sale-median rise, landlord opt-in. Weights are adjustable in the app.

**Fit** (`fit_components()`) scores a requested use from the storefront filing, subway distance, and matched PLUTO class / retail area / zoning. Unmatched fields add zero and say so.

## Lease desk

Closed until there is an account (Google → business name → `user_accounts`; typed name/email stays in-browser only). With `XAI_API_KEY`, the desk calls SpaceXAI, streams filing lookups, and drafts notes only from those filings. Approve to store; nothing is emailed. No key → same flow from local filing search.
