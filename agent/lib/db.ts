// Thin database layer: PostgreSQL in production (`pg`), embedded PGlite for
// local runs and tests (`DATABASE_URL=pglite:./data/jarvis` or `pglite:memory`).

import { MIGRATIONS } from "./migrations.ts";
import { redact } from "./redact.ts";

export interface QueryResult<T> {
  rows: T[];
}

export interface Db {
  kind: "postgres" | "pglite";
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function openDb(url: string): Promise<Db> {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    // A non-constant specifier keeps the bundler from inlining PGlite (its WASM
    // and data files must be loaded from the installed package at runtime).
    const spec = process.env.PGLITE_MODULE || ["@electric-sql", "pglite"].join("/");
    const { PGlite } = (await import(/* @vite-ignore */ spec)) as typeof import("@electric-sql/pglite");
    const pg = target === "memory" || target === "" ? new PGlite() : new PGlite(target);
    await pg.waitReady;
    return {
      kind: "pglite",
      async query<T>(sql: string, params: unknown[] = []) {
        const r = await pg.query<T>(sql, params as never[]);
        return { rows: r.rows };
      },
      async exec(sql: string) {
        await pg.exec(sql);
      },
      async close() {
        await pg.close();
      },
    };
  }

  const pgMod = await import("pg");
  const Pool = (pgMod.default?.Pool ?? (pgMod as unknown as { Pool: typeof import("pg").Pool }).Pool);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (err: Error) => console.error(redact(`pg pool error: ${err.message}`)));
  return {
    kind: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`);
  const { rows } = await db.query<{ version: string }>("SELECT version FROM schema_migrations");
  const done = new Set(rows.map((r) => r.version));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.exec(m.sql);
    await db.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [m.version]);
    applied.push(m.version);
  }
  return applied;
}

let shared: Promise<Db> | null = null;

/** Process-wide database handle, migrated on first use. */
export function getDb(): Promise<Db> {
  if (!shared) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      return Promise.reject(new Error("DATABASE_URL is not set (see .env.example)."));
    }
    shared = (async () => {
      const db = await openDb(url);
      await migrate(db);
      return db;
    })().catch((err) => {
      shared = null;
      throw new Error(redact(`Database unavailable: ${err instanceof Error ? err.message : String(err)}`));
    });
  }
  return shared;
}

/** Test hook: inject a database (or clear the singleton). */
export function setSharedDbForTests(db: Db | null): void {
  shared = db ? Promise.resolve(db) : null;
}
