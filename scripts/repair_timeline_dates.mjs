/**
 * Repair property_events where subject dates (license expiration, lease end)
 * were stored as occurred_at, including future dates.
 *
 * Usage:
 *   DATABASE_URL=postgres://leaselens:leaselens@localhost:5433/leaselens node scripts/repair_timeline_dates.mjs
 */
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL || "postgres://leaselens:leaselens@localhost:5433/leaselens";

const client = new pg.Client({ connectionString });
await client.connect();
await client.query("BEGIN");

try {
  const deleted = await client.query(`DELETE FROM property_events WHERE event_type = 'license'`);
  console.log("deleted license events", deleted.rowCount);

  const inserted = await client.query(`
    INSERT INTO property_events (
      property_id, occurred_at, event_type, title, detail, source, provenance, payload
    )
    SELECT
      l.property_id,
      COALESCE(l.created_date, LEAST(l.expiration_date, CURRENT_DATE))::timestamptz,
      'license',
      CONCAT('DCWP license ', COALESCE(l.status, '')),
      CONCAT(
        COALESCE(l.business_name, 'A business'),
        ' — ',
        COALESCE(l.category, 'license'),
        '. Status ',
        COALESCE(l.status, 'not stated'),
        '. Expiration on file ',
        COALESCE(l.expiration_date::text, 'not stated'),
        '. Joined on the tax lot.'
      ),
      COALESCE(l.source, 'DCWP Issued Licenses'),
      COALESCE(l.provenance, 'nyc_open_data'),
      jsonb_strip_nulls(jsonb_build_object(
        'status', l.status,
        'created_date', l.created_date,
        'expiration_date', l.expiration_date
      ))
    FROM licenses l
    WHERE l.created_date IS NOT NULL
       OR (l.expiration_date IS NOT NULL AND l.expiration_date <= CURRENT_DATE)
  `);
  console.log("inserted license events", inserted.rowCount);

  const futureLeases = await client.query(`
    SELECT property_id, title, detail, source, provenance, payload, occurred_at::date AS bad_date
    FROM property_events
    WHERE event_type = 'lease_date_on_file'
      AND occurred_at::date > CURRENT_DATE
  `);
  console.log("future lease events to rebuild", futureLeases.rowCount);

  await client.query(`
    DELETE FROM property_events
    WHERE event_type = 'lease_date_on_file'
      AND occurred_at::date > CURRENT_DATE
  `);

  let leaseInserted = 0;
  const yearNow = new Date().getFullYear();
  for (const row of futureLeases.rows) {
    const payload = row.payload || {};
    const year = Number(String(payload.reporting_year || "").match(/\d{4}/)?.[0] || NaN);
    const lease =
      payload.lease_expiration ||
      (row.bad_date ? String(row.bad_date).slice(0, 10) : null);
    if (!Number.isFinite(year) || year < 1990 || year > yearNow + 1) continue;
    const filed = `${year}-12-31`;
    await client.query(
      `INSERT INTO property_events (
         property_id, occurred_at, event_type, title, detail, source, provenance, payload
       ) VALUES ($1, $2::date, 'lease_date_on_file', $3, $4, $5, $6, $7::jsonb)`,
      [
        row.property_id,
        filed,
        row.title || "Lease expiration on file",
        row.detail,
        row.source,
        row.provenance,
        JSON.stringify({
          ...payload,
          lease_expiration: lease,
          reporting_year: payload.reporting_year || String(year),
        }),
      ],
    );
    leaseInserted += 1;
  }
  console.log("reinserted lease events", leaseInserted);

  const future = await client.query(`
    SELECT event_type, COUNT(*)::int AS n, MAX(occurred_at)::date::text AS maxd
    FROM property_events
    WHERE occurred_at::date > CURRENT_DATE
    GROUP BY 1
    ORDER BY n DESC
  `);
  console.log("remaining future events", future.rows);

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
