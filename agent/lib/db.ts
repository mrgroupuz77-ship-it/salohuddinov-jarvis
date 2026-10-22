// Thin database layer: PostgreSQL in production (`pg`, e.g. Neon on Vercel),
// embedded PGlite for a single long-running server, local runs and tests
// (`DATABASE_URL=pglite:./data/jarvis` or `pglite:memory`).

import { resolveDatabaseUrl } from "./config.ts";
import { MIGRATIONS } from "./migrations.ts";
import { redact } from "./redact.ts";

export interface QueryResult<T> {
  rows: T[];
}

export interface Db {
  kind: "postgres" | "pglite";
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  /** Runs `fn` on one connection inside BEGIN/COMMIT (ROLLBACK on error). */
  transaction<T>(fn: (tx: Pick<Db, "query" | "exec">) => Promise<T>): Promise<T>;
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
      async transaction<T>(fn: (tx: Pick<Db, "query" | "exec">) => Promise<T>) {
        return pg.transaction(async (t) =>
          fn({
            async query<R>(sql: string, params: unknown[] = []) {
              const r = await t.query<R>(sql, params as never[]);
              return { rows: r.rows };
            },
            async exec(sql: string) {
              await t.exec(sql);
            },
          }),
        );
      },
      async close() {
        await pg.close();
      },
    };
  }

  const pgMod = await import("pg");
  const Pool = (pgMod.default?.Pool ?? (pgMod as unknown as { Pool: typeof import("pg").Pool }).Pool);
  const serverless = process.env.VERCEL === "1";
  const pool = new Pool({
    connectionString: url,
    // Serverless instances are many and short-lived: keep each pool tiny and
    // let idle connections go (use the provider's pooled URL, e.g. Neon "-pooler").
    max: Number(process.env.DATABASE_POOL_MAX ?? (serverless ? 2 : 5)),
    idleTimeoutMillis: serverless ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // sslmode in the URL is honoured by pg (verified TLS). Only a self-hosted
    // database with a self-signed certificate needs DATABASE_SSL_INSECURE=true.
    ssl: process.env.DATABASE_SSL_INSECURE === "true" ? { rejectUnauthorized: false } : undefined,
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
    async transaction<T>(fn: (tx: Pick<Db, "query" | "exec">) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query<R>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params);
            return { rows: r.rows as R[] };
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

// Arbitrary constant: serialises migrations when several serverless instances
// start at the same moment.
const MIGRATION_LOCK_KEY = 7_412_026;

export async function migrate(db: Db): Promise<string[]> {
  return db.transaction(async (tx) => {
    if (db.kind === "postgres") await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
    await tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
    const { rows } = await tx.query<{ version: string }>("SELECT version FROM schema_migrations");
    const done = new Set(rows.map((r) => r.version));
    const applied: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await tx.exec(m.sql);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [m.version]);
      applied.push(m.version);
    }
    return applied;
  });
}

let shared: Promise<Db> | null = null;

/** Process-wide database handle, migrated on first use. */
export function getDb(): Promise<Db> {
  if (!shared) {
    const url = resolveDatabaseUrl();
    if (!url) {
      return Promise.reject(new Error("Baza ulanmagan: DATABASE_URL (yoki POSTGRES_URL) yo‘q. Vercel’da Neon bazasini ulang (DEPLOYMENT.md)."));
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
