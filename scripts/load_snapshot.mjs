import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..");
const connectionString =
  process.env.DATABASE_URL || "postgres://leaselens:leaselens@localhost:5432/leaselens";

const snapshot = JSON.parse(fs.readFileSync(path.join(root, "data/snapshot.json"), "utf8"));
const schema = fs.readFileSync(path.join(root, "sql/schema.sql"), "utf8");

const client = new pg.Client({ connectionString });
await client.connect();

const preserved = { landlords: [], watches: [] };
const existing = await client.query("SELECT to_regclass('public.landlord_signals') AS name");
if (existing.rows[0]?.name) {
  preserved.landlords = (
    await client.query(
      `SELECT property_id, window_months, note, contact_email, active, created_at
       FROM landlord_signals WHERE NOT is_demo`,
    )
  ).rows;
  preserved.watches = (
    await client.query("SELECT id, session_id, property_id, created_at FROM owner_watches")
  ).rows;
}

await client.query(schema);

async function insert(table, columns, rows, casts = {}) {
  const size = 80;
  for (let offset = 0; offset < rows.length; offset += size) {
    const slice = rows.slice(offset, offset + size);
    const values = [];
    const groups = slice.map((row, rowIndex) => {
      const cells = columns.map((column, columnIndex) => {
        let value = row[column];
        if (value === "") value = null;
        if (casts[column] === "json" && value != null) value = JSON.stringify(value);
        values.push(value);
        const placeholder = `$${rowIndex * columns.length + columnIndex + 1}`;
        return casts[column] === "json" ? `${placeholder}::jsonb` : placeholder;
      });
      return `(${cells.join(",")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${groups.join(",")} ON CONFLICT DO NOTHING`,
      values,
    );
  }
}

const properties = snapshot.properties.map((row) => ({
  ...row,
  as_of: row.as_of || null,
  lease_expiration: row.lease_expiration || null,
  sold_date: row.sold_date || null,
}));

await insert("properties", [
  "id", "bbl", "bin", "address", "borough", "neighborhood", "source_neighborhood", "zip",
  "lat", "lng", "unit", "reporting_year", "reporting_year_num", "as_of", "primary_activity",
  "activity_category", "vacant_on_1231", "vacant_on_630", "lease_expiration", "sold_date",
  "construction_reported", "census_tract", "year_built", "building_class", "land_use", "zoning",
  "retail_area", "commercial_area", "assessed_total", "lot_area", "building_area", "pluto_matched",
  "churn_detail", "provenance", "source_dataset",
], properties);

await insert("property_events", [
  "property_id", "occurred_at", "event_type", "title", "detail", "source", "provenance", "payload",
], snapshot.events, { payload: "json" });

await insert("businesses", [
  "id", "name", "category", "activity", "address", "neighborhood", "borough", "lat", "lng",
  "source", "source_dataset", "provenance", "as_of",
], snapshot.businesses);

await insert("transit_stations", [
  "id", "name", "routes", "borough", "ada", "lat", "lng", "source", "source_dataset", "provenance",
], snapshot.stations.filter((row) => row.id && row.name));

await insert("pedestrian_counts", [
  "id", "location", "borough", "lat", "lng", "count", "count_label", "source", "source_dataset", "provenance",
], snapshot.pedestrians);

await insert("permits", [
  "id", "property_id", "bbl", "job_number", "filing_date", "status", "job_type", "description",
  "initial_cost", "address", "provenance", "source",
], snapshot.permits);

await insert("sales", [
  "id", "property_id", "bbl", "sale_date", "sale_price", "building_class", "category",
  "commercial_units", "address", "neighborhood", "provenance", "source",
], snapshot.sales);

await insert("licenses", [
  "id", "property_id", "bbl", "business_name", "category", "status", "created_date",
  "expiration_date", "provenance", "source",
], snapshot.licenses);

await insert("neighborhood_stats", [
  "name", "borough", "source_names", "reporting_year", "storefronts", "vacant", "vacancy_rate",
  "storefronts_2023", "vacant_2023", "vacancy_rate_2023", "categories", "activities",
  "restaurant_count", "restaurant_radius_m", "restaurant_note", "provenance", "source",
], snapshot.neighborhoods, { categories: "json", activities: "json" });

await insert("sales_trends", [
  "neighborhood", "year", "sales", "median_price", "provenance", "source",
], snapshot.sales_trends);

if (snapshot.tracts?.length) {
  await insert("tract_metrics", [
    "borough", "tract", "population", "median_income", "median_income_prior", "vintage",
    "prior_vintage", "provenance", "source",
  ], snapshot.tracts);
}

await client.query(`
  UPDATE properties SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326);
  UPDATE businesses SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326);
  UPDATE transit_stations SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326);
  UPDATE pedestrian_counts SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326);
`);

await client.query(`
  INSERT INTO landlord_signals (id, property_id, window_months, note, contact_email, is_demo)
  SELECT 'demo-' || substr(md5(id), 1, 12), id, 6,
         'Demo only. Not a real landlord.',
         'demo@leaselens.local',
         TRUE
  FROM (
    SELECT id
    FROM properties
    WHERE NOT vacant_on_1231 AND NOT vacant_on_630 AND lease_expiration IS NULL
      AND borough = 'Brooklyn'
    ORDER BY neighborhood, address
    LIMIT 3
  ) picked
`);

for (const row of preserved.landlords) {
  const found = await client.query("SELECT 1 FROM properties WHERE id = $1", [row.property_id]);
  if (!found.rowCount) continue;
  await client.query(
    `INSERT INTO landlord_signals (id, property_id, window_months, note, contact_email, is_demo, active, created_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      `restored-${row.property_id}`,
      row.property_id,
      row.window_months,
      row.note,
      row.contact_email,
      row.active,
      row.created_at,
    ],
  );
}

for (const row of preserved.watches) {
  const found = await client.query("SELECT 1 FROM properties WHERE id = $1", [row.property_id]);
  if (!found.rowCount) continue;
  await client.query(
    `INSERT INTO owner_watches (id, session_id, property_id, created_at)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [row.id, row.session_id, row.property_id, row.created_at],
  );
}

await client.query("SELECT refresh_signals()");

const summary = await client.query(`
  SELECT
    (SELECT count(*) FROM properties) AS properties,
    (SELECT count(*) FROM signals) AS signals,
    (SELECT count(*) FROM property_events) AS events,
    (SELECT count(*) FROM businesses) AS businesses,
    (SELECT count(*) FROM transit_stations) AS stations,
    (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb') AS timescaledb,
    (SELECT PostGIS_Version()) AS postgis,
    (SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'property_events') AS hypertables
`);
console.log(summary.rows[0]);
await client.end();
