-- LeaseLens NYC
-- Tiger Data (TimescaleDB) + PostGIS. Scores are derived from stored evidence.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

DROP VIEW IF EXISTS v_filing_trends;
DROP VIEW IF EXISTS v_storefronts;
DROP FUNCTION IF EXISTS refresh_signals();
DROP FUNCTION IF EXISTS fit_components(text, text);

DROP TABLE IF EXISTS signals CASCADE;
DROP TABLE IF EXISTS renter_profiles CASCADE;
DROP TABLE IF EXISTS owner_watches CASCADE;
DROP TABLE IF EXISTS landlord_signals CASCADE;
DROP TABLE IF EXISTS property_events CASCADE;
DROP TABLE IF EXISTS permits CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;
DROP TABLE IF EXISTS transit_stations CASCADE;
DROP TABLE IF EXISTS pedestrian_counts CASCADE;
DROP TABLE IF EXISTS neighborhood_stats CASCADE;
DROP TABLE IF EXISTS sales_trends CASCADE;
DROP TABLE IF EXISTS tract_metrics CASCADE;
DROP TABLE IF EXISTS properties CASCADE;

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  bbl TEXT NOT NULL,
  bin TEXT,
  address TEXT NOT NULL,
  borough TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  source_neighborhood TEXT,
  zip TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326),
  unit TEXT,
  reporting_year TEXT,
  reporting_year_num INT,
  as_of DATE,
  primary_activity TEXT,
  activity_category TEXT,
  vacant_on_1231 BOOLEAN NOT NULL DEFAULT FALSE,
  vacant_on_630 BOOLEAN NOT NULL DEFAULT FALSE,
  lease_expiration DATE,
  sold_date DATE,
  construction_reported BOOLEAN NOT NULL DEFAULT FALSE,
  census_tract TEXT,
  year_built INT,
  building_class TEXT,
  land_use TEXT,
  zoning TEXT,
  retail_area NUMERIC,
  commercial_area NUMERIC,
  assessed_total NUMERIC,
  lot_area NUMERIC,
  building_area NUMERIC,
  pluto_matched BOOLEAN NOT NULL DEFAULT FALSE,
  churn_detail TEXT,
  provenance TEXT NOT NULL,
  source_dataset TEXT NOT NULL
);

CREATE INDEX properties_geom_gix ON properties USING GIST (geom);
CREATE INDEX properties_neighborhood_idx ON properties (neighborhood);
CREATE INDEX properties_borough_idx ON properties (borough);
CREATE INDEX properties_bbl_idx ON properties (bbl);

CREATE TABLE property_events (
  event_id BIGSERIAL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  source TEXT NOT NULL,
  provenance TEXT NOT NULL,
  payload JSONB
);

SELECT create_hypertable('property_events', by_range('occurred_at'), if_not_exists => TRUE);
CREATE INDEX property_events_property_idx ON property_events (property_id, occurred_at DESC);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT NOT NULL,
  activity TEXT,
  address TEXT,
  neighborhood TEXT,
  borough TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326),
  source TEXT NOT NULL,
  source_dataset TEXT,
  provenance TEXT NOT NULL,
  as_of TEXT
);
CREATE INDEX businesses_geom_gix ON businesses USING GIST (geom);
CREATE INDEX businesses_category_idx ON businesses (category);

CREATE TABLE transit_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  routes TEXT,
  borough TEXT,
  ada BOOLEAN,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326),
  source TEXT NOT NULL,
  source_dataset TEXT,
  provenance TEXT NOT NULL
);
CREATE INDEX transit_geom_gix ON transit_stations USING GIST (geom);

CREATE TABLE pedestrian_counts (
  id TEXT PRIMARY KEY,
  location TEXT,
  borough TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326),
  count INT NOT NULL,
  count_label TEXT NOT NULL,
  source TEXT NOT NULL,
  source_dataset TEXT,
  provenance TEXT NOT NULL
);
CREATE INDEX pedestrian_geom_gix ON pedestrian_counts USING GIST (geom);

CREATE TABLE permits (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  bbl TEXT NOT NULL,
  job_number TEXT,
  filing_date DATE,
  status TEXT,
  job_type TEXT,
  description TEXT,
  initial_cost NUMERIC,
  address TEXT,
  provenance TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX permits_property_idx ON permits (property_id, filing_date DESC);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  bbl TEXT NOT NULL,
  sale_date DATE,
  sale_price NUMERIC,
  building_class TEXT,
  category TEXT,
  commercial_units NUMERIC,
  address TEXT,
  neighborhood TEXT,
  provenance TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX sales_property_idx ON sales (property_id, sale_date DESC);

CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  bbl TEXT NOT NULL,
  business_name TEXT,
  category TEXT,
  status TEXT,
  created_date DATE,
  expiration_date DATE,
  provenance TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX licenses_property_idx ON licenses (property_id, expiration_date DESC);

CREATE TABLE neighborhood_stats (
  name TEXT PRIMARY KEY,
  borough TEXT NOT NULL,
  source_names TEXT[] NOT NULL,
  reporting_year TEXT NOT NULL,
  storefronts INT NOT NULL,
  vacant INT NOT NULL,
  vacancy_rate NUMERIC,
  storefronts_2023 INT,
  vacant_2023 INT,
  vacancy_rate_2023 NUMERIC,
  categories JSONB NOT NULL,
  activities JSONB NOT NULL,
  restaurant_count INT,
  restaurant_radius_m INT,
  restaurant_note TEXT,
  provenance TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE sales_trends (
  neighborhood TEXT NOT NULL,
  year INT NOT NULL,
  sales INT NOT NULL,
  median_price INT NOT NULL,
  provenance TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (neighborhood, year)
);

CREATE TABLE tract_metrics (
  borough TEXT NOT NULL,
  tract TEXT NOT NULL,
  population INT,
  median_income INT,
  median_income_prior INT,
  vintage TEXT,
  prior_vintage TEXT,
  provenance TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (borough, tract)
);

CREATE TABLE landlord_signals (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  window_months INT NOT NULL CHECK (window_months IN (3, 6, 12)),
  note TEXT,
  contact_email TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE owner_watches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, property_id)
);

CREATE TABLE renter_profiles (
  session_id TEXT PRIMARY KEY,
  lease_kind TEXT NOT NULL,
  commercial_use TEXT,
  beds TEXT,
  budget TEXT,
  home_budget TEXT,
  size_band TEXT,
  timing TEXT,
  near_subway BOOLEAN,
  boroughs TEXT[] NOT NULL DEFAULT '{}',
  neighborhoods TEXT[] NOT NULL DEFAULT '{}',
  must_haves TEXT[] NOT NULL DEFAULT '{}',
  concept TEXT,
  profile JSONB NOT NULL,
  brief JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signals (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  weight INT NOT NULL,
  label TEXT NOT NULL,
  evidence TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at DATE,
  provenance TEXT NOT NULL,
  is_prediction BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX signals_property_idx ON signals (property_id);

CREATE OR REPLACE FUNCTION refresh_signals() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM signals;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT id, 'reported_vacant',
    CASE WHEN vacant_on_1231 AND vacant_on_630 THEN 44 ELSE 36 END,
    'Reported vacant',
    format(
      'Storefront Registry reporting year %s. Vacant on Dec 31: %s. Vacant on Jun 30 or date sold: %s. As-of date used for this filing: %s. This is a filed status, not a brokerage listing.',
      reporting_year,
      CASE WHEN vacant_on_1231 THEN 'YES' ELSE 'NO' END,
      CASE WHEN vacant_on_630 THEN 'YES' ELSE 'NO' END,
      as_of
    ),
    'NYC Storefront Registry (92iy-9c3n)',
    as_of,
    'nyc_open_data',
    FALSE
  FROM properties
  WHERE vacant_on_1231 OR vacant_on_630;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT id,
    CASE
      WHEN lease_expiration BETWEEN CURRENT_DATE - 120 AND CURRENT_DATE + 180 THEN 'lease_within_6_months'
      ELSE 'lease_within_12_months'
    END,
    CASE
      WHEN lease_expiration BETWEEN CURRENT_DATE - 120 AND CURRENT_DATE + 180 THEN 28
      ELSE 14
    END,
    'Lease date on file',
    format(
      'The latest storefront filing (%s) includes expir_dt_of_most_recent_lease = %s. That date is shown because it is in the filing. It does not confirm the space is listed, vacant, or actually turning over.',
      reporting_year,
      lease_expiration
    ),
    'NYC Storefront Registry (92iy-9c3n)',
    lease_expiration,
    'nyc_open_data',
    FALSE
  FROM properties
  WHERE lease_expiration IS NOT NULL
    AND lease_expiration BETWEEN CURRENT_DATE - 180 AND CURRENT_DATE + 365;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT DISTINCT ON (property_id)
    property_id,
    'dof_sale',
    18,
    'Building sold on a DOF filing',
    format(
      'DOF Rolling Calendar Sales records a %s sale on %s for $%s. Joined on the tax lot (BBL %s), so it may not be this storefront unit. Transfers under $100,000 are ignored.',
      COALESCE(category, 'recorded'),
      sale_date,
      to_char(sale_price, 'FM999,999,999'),
      bbl
    ),
    source,
    sale_date,
    'nyc_open_data',
    FALSE
  FROM sales
  WHERE sale_date >= CURRENT_DATE - INTERVAL '24 months'
    AND sale_price >= 100000
  ORDER BY property_id, sale_date DESC;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT p.id, 'registry_sold_date', 16, 'Sale date on the storefront filing',
    format('The %s storefront filing includes sold_date %s. No matching DOF sale over $100,000 in the last 24 months was joined for this lot.', p.reporting_year, p.sold_date),
    'NYC Storefront Registry (92iy-9c3n)',
    p.sold_date,
    'nyc_open_data',
    FALSE
  FROM properties p
  WHERE p.sold_date >= CURRENT_DATE - INTERVAL '24 months'
    AND NOT EXISTS (
      SELECT 1 FROM signals s WHERE s.property_id = p.id AND s.signal_type = 'dof_sale'
    );

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT id, 'construction_reported', 8, 'Construction reported on the filing',
    format('The %s storefront filing has construction_reported = YES.', reporting_year),
    'NYC Storefront Registry (92iy-9c3n)',
    as_of,
    'nyc_open_data',
    FALSE
  FROM properties
  WHERE construction_reported;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT DISTINCT ON (property_id)
    property_id,
    'alteration_permit',
    CASE
      WHEN job_type ILIKE '%demol%' THEN 16
      WHEN coalesce(description, '') ILIKE '%sidewalk shed%' OR coalesce(description, '') ILIKE '%scaffold%' THEN 5
      WHEN job_type ILIKE '%new building%' THEN 12
      WHEN coalesce(description, '') ~* '(2[0-9]|[3-9])(st|nd|rd|th) floor' THEN 6
      ELSE 14
    END,
    CASE
      WHEN coalesce(description, '') ILIKE '%sidewalk shed%' OR coalesce(description, '') ILIKE '%scaffold%'
        THEN 'Recent sidewalk shed or scaffold filing'
      ELSE 'Recent DOB job filing'
    END,
    format(
      'DOB NOW job %s (%s) was filed %s. Status: %s. Initial cost on the filing: %s. Description: %s. Joined on tax lot %s, not confirmed as this storefront unit. Shed and scaffold filings receive fewer turnover points than other alteration work.',
      job_number,
      COALESCE(job_type, 'job type not stated'),
      filing_date,
      COALESCE(status, 'not stated'),
      COALESCE(to_char(initial_cost, 'FM$999,999,999'), 'not stated'),
      COALESCE(left(description, 180), 'not stated'),
      bbl
    ),
    source,
    filing_date,
    'nyc_open_data',
    FALSE
  FROM permits
  WHERE filing_date >= CURRENT_DATE - INTERVAL '18 months'
    AND COALESCE(job_type, '') <> 'No Work'
  ORDER BY property_id, filing_date DESC;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT DISTINCT ON (property_id)
    property_id,
    'license_lapsed',
    12,
    'DCWP license expiration on file',
    format(
      '%s (%s) shows status %s and expiration %s. Joined on tax lot %s, not confirmed as this storefront unit. An expired license is not proof the storefront is empty.',
      COALESCE(business_name, 'A licensed business'),
      COALESCE(category, 'unspecified category'),
      COALESCE(status, 'not stated'),
      expiration_date,
      bbl
    ),
    source,
    expiration_date,
    'nyc_open_data',
    FALSE
  FROM licenses
  WHERE expiration_date BETWEEN CURRENT_DATE - INTERVAL '18 months' AND CURRENT_DATE
    AND COALESCE(lower(status), '') <> 'active'
  ORDER BY property_id, expiration_date DESC;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT id, 'tenant_activity_changed', 10, 'Historical activity changed',
    churn_detail,
    'NYC Storefront Registry filings for this address',
    as_of,
    'derived',
    FALSE
  FROM properties
  WHERE churn_detail IS NOT NULL;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT p.id, 'neighborhood_sales_up', 6, 'Nearby commercial sale prices are higher',
    format(
      'DOF commercial sales in %s (price at least $100,000 and commercial units > 0) have a median of $%s across %s sales in %s, compared with $%s across %s sales in %s. The later year only includes sales present in the rolling file and may be year-to-date. This is a neighborhood median, not this building''s price, and it is not a rent forecast.',
      latest.neighborhood,
      to_char(latest.median_price, 'FM999,999,999'),
      latest.sales,
      latest.year,
      to_char(prior.median_price, 'FM999,999,999'),
      prior.sales,
      prior.year
    ),
    'DOF Rolling Calendar Sales (usep-8jbt)',
    make_date(latest.year, 1, 1),
    'derived',
    FALSE
  FROM properties p
  JOIN LATERAL (
    SELECT *
    FROM sales_trends t
    WHERE upper(t.neighborhood) = upper(p.neighborhood)
       OR upper(t.neighborhood) LIKE '%' || upper(replace(p.neighborhood, '-', ' ')) || '%'
    ORDER BY t.year DESC
    LIMIT 1
  ) latest ON latest.sales >= 8
  JOIN LATERAL (
    SELECT *
    FROM sales_trends t
    WHERE (upper(t.neighborhood) = upper(latest.neighborhood))
      AND t.year < latest.year
      AND t.sales >= 8
    ORDER BY t.year DESC
    LIMIT 1
  ) prior ON prior.median_price > 0 AND latest.median_price >= prior.median_price * 1.08;

  INSERT INTO signals (property_id, signal_type, weight, label, evidence, source, observed_at, provenance, is_prediction)
  SELECT p.id, 'landlord_opt_in', 18, 'Anonymous early-availability signal',
    CASE
      WHEN l.is_demo THEN 'Demo landlord opt-in seeded so this workflow is visible. It is not a city record and not a real landlord. Entrepreneurs only see this anonymous line.'
      ELSE format('A landlord privately indicated this storefront may become available within %s months. Identity and notes are hidden. This is a self-report, not a city filing or a confirmed listing.', l.window_months)
    END,
    CASE WHEN l.is_demo THEN 'LeaseLens demo opt-in' ELSE 'Landlord opt-in' END,
    l.created_at::date,
    CASE WHEN l.is_demo THEN 'demo_landlord_opt_in' ELSE 'landlord_opt_in' END,
    FALSE
  FROM landlord_signals l
  JOIN properties p ON p.id = l.property_id
  WHERE l.active;
END;
$$;

CREATE OR REPLACE FUNCTION fit_components(p_id text, p_category text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  p properties%ROWTYPE;
  subway_m DOUBLE PRECISION;
  points INT;
  items jsonb := '[]'::jsonb;
  category text := lower(COALESCE(p_category, 'storefront'));
BEGIN
  SELECT * INTO p FROM properties WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Registered storefront',
    'points', 20,
    'evidence', 'This row is a ground-floor or second-floor storefront filing in the NYC Storefront Registry.',
    'source', 'NYC Storefront Registry'
  ));

  points := CASE
    WHEN category IN ('restaurant', 'cafe', 'food') AND p.activity_category = 'food_and_drink' THEN 18
    WHEN category IN ('restaurant', 'cafe', 'food') AND p.activity_category = 'grocery' THEN 12
    WHEN category IN ('restaurant', 'cafe', 'food') AND p.activity_category = 'retail' THEN 10
    WHEN category = 'retail' AND p.activity_category = 'retail' THEN 18
    WHEN category = 'grocery' AND p.activity_category IN ('grocery', 'food_and_drink', 'retail') THEN 16
    WHEN category = 'fitness' AND p.activity_category IN ('fitness', 'retail', 'vacant_or_unidentified') THEN 14
    WHEN category = 'personal_services' AND p.activity_category IN ('personal_services', 'retail') THEN 16
    WHEN p.activity_category = 'vacant_or_unidentified' THEN 6
    WHEN p.activity_category = 'retail' THEN 8
    ELSE 4
  END;
  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Latest filed use',
    'points', points,
    'evidence', format('Latest filing activity is "%s" (mapped to %s) in reporting year %s. Prior use is context for fit, not proof the space is built out for a new concept.', COALESCE(p.primary_activity, 'not reported'), p.activity_category, p.reporting_year),
    'source', 'NYC Storefront Registry'
  ));

  SELECT min(ST_Distance(p.geom::geography, s.geom::geography))
    INTO subway_m
  FROM transit_stations s
  WHERE p.geom IS NOT NULL AND ST_DWithin(p.geom::geography, s.geom::geography, 1200);

  points := CASE
    WHEN subway_m IS NULL THEN 0
    WHEN subway_m <= 400 THEN 16
    WHEN subway_m <= 800 THEN 10
    ELSE 4
  END;
  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Subway access',
    'points', points,
    'evidence', CASE
      WHEN subway_m IS NULL THEN 'No MTA station from the station file falls within 1.2 km.'
      ELSE format('Nearest station in the MTA station file is about %s meters away.', round(subway_m)::int)
    END,
    'source', 'MTA Subway Stations (39hk-dx4f)'
  ));

  points := CASE
    WHEN p.building_class ILIKE 'K%' THEN 14
    WHEN p.building_class ILIKE 'S%' THEN 10
    WHEN p.building_class ILIKE 'C%' OR p.building_class ILIKE 'D%' OR p.building_class ILIKE 'L%' THEN 8
    WHEN p.building_class IS NULL THEN 0
    ELSE 3
  END;
  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Building class',
    'points', points,
    'evidence', CASE
      WHEN NOT p.pluto_matched THEN 'PLUTO did not match this BBL, so building class is blank. No class was invented.'
      ELSE format('PLUTO building class %s on tax lot %s.', COALESCE(p.building_class, 'blank'), p.bbl)
    END,
    'source', 'PLUTO (64uk-42ks)'
  ));

  points := CASE
    WHEN p.retail_area IS NULL THEN 0
    WHEN p.retail_area >= 400 THEN 10
    WHEN p.retail_area > 0 THEN 6
    ELSE 0
  END;
  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Retail floor area',
    'points', points,
    'evidence', CASE
      WHEN NOT p.pluto_matched THEN 'Retail area is blank because PLUTO did not match this lot.'
      WHEN p.retail_area IS NULL THEN 'PLUTO matched, but retail area is blank.'
      ELSE format('PLUTO retailarea is %s square feet on the tax lot, which can include more than this storefront.', trim(to_char(p.retail_area, 'FM999,999')))
    END,
    'source', 'PLUTO (64uk-42ks)'
  ));

  points := CASE
    WHEN p.zoning ILIKE 'C%' OR p.zoning ILIKE 'M%' THEN 8
    WHEN p.zoning IS NULL THEN 0
    ELSE 2
  END;
  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Zoning district',
    'points', points,
    'evidence', CASE
      WHEN p.zoning IS NULL THEN 'Zoning district was not available from a PLUTO match.'
      ELSE format('PLUTO zoning district is %s. A commercial overlay can exist even when the base district is residential; this field alone does not prove overlay status.', p.zoning)
    END,
    'source', 'PLUTO (64uk-42ks)'
  ));

  points := CASE
    WHEN p.vacant_on_1231 OR p.vacant_on_630 OR p.lease_expiration BETWEEN CURRENT_DATE - 180 AND CURRENT_DATE + 365
      OR EXISTS (SELECT 1 FROM landlord_signals l WHERE l.property_id = p.id AND l.active)
    THEN 8 ELSE 0 END;
  items := items || jsonb_build_array(jsonb_build_object(
    'label', 'Availability evidence',
    'points', points,
    'evidence', 'Points are added only when a vacancy flag, an in-window lease date, or a landlord opt-in is already on file. The fit index does not predict a lease.',
    'source', 'Derived from stored signals'
  ));

  RETURN items;
END;
$$;

CREATE VIEW v_storefronts AS
SELECT p.*,
  LEAST(100, COALESCE(t.turnover_score, 0))::int AS turnover_score,
  COALESCE(t.signal_count, 0)::int AS signal_count,
  EXISTS (SELECT 1 FROM landlord_signals l WHERE l.property_id = p.id AND l.active AND l.is_demo) AS has_demo_landlord,
  EXISTS (SELECT 1 FROM landlord_signals l WHERE l.property_id = p.id AND l.active AND NOT l.is_demo) AS has_landlord_opt_in
FROM properties p
LEFT JOIN (
  SELECT property_id, SUM(weight)::int AS turnover_score, COUNT(*)::int AS signal_count
  FROM signals
  GROUP BY property_id
) t ON t.property_id = p.id;

CREATE VIEW v_filing_trends AS
SELECT p.neighborhood,
       time_bucket('1 year', e.occurred_at) AS year_bucket,
       count(*) FILTER (WHERE COALESCE((e.payload->>'vacant')::boolean, false)) AS vacant_filings,
       count(*) AS filings
FROM property_events e
JOIN properties p ON p.id = e.property_id
WHERE e.event_type = 'storefront_filing'
GROUP BY 1, 2;
