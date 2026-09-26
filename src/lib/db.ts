import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://leaselens:leaselens@localhost:5432/leaselens",
    max: 8,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pool = pool;
}

export async function query<T>(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
