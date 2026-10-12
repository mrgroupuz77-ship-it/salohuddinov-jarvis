// Shared plumbing for tools: owner check on every call, database access,
// and readable dates for the model.

import { createHash } from "node:crypto";

import { assertAuthorized } from "./auth.ts";
import type { PrincipalLike } from "./auth.ts";
import type { AppConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import type { Db } from "./db.ts";
import { getDb } from "./db.ts";
import { StoreError } from "./store.ts";
import { formatLocal } from "./time.ts";
import "./log.ts";

export interface ToolCtxLike {
  session?: { id?: string; turn?: { id?: string }; auth?: { current?: PrincipalLike | null } };
}

export interface ToolEnv {
  db: Db;
  cfg: AppConfig;
  tz: string;
  turnId: string;
}

/** Runs a tool body only for the verified owner; store rule errors become readable results. */
export async function ownerTool<T>(ctx: ToolCtxLike | undefined, body: (env: ToolEnv) => Promise<T>): Promise<T | { error: string }> {
  const cfg = loadConfig();
  assertAuthorized(ctx?.session?.auth?.current, cfg);
  const db = await getDb();
  try {
    return await body({ db, cfg, tz: cfg.timezone, turnId: ctx?.session?.turn?.id ?? "no-turn" });
  } catch (err) {
    if (err instanceof StoreError) return { error: err.message };
    throw err;
  }
}

export function stableKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

const DATE_FIELDS = ["due_at", "created_at", "updated_at", "completed_at", "last_contact_at", "scheduled_for", "decided_at", "executed_at"];

/** Adds `<field>_local` next to timestamps so the model shows owner-local times. */
export function localize<T extends Record<string, unknown>>(row: T, tz: string): T & Record<string, string | null> {
  const out: Record<string, unknown> = { ...row };
  for (const f of DATE_FIELDS) {
    const v = row[f];
    if (v instanceof Date || typeof v === "string") {
      const d = new Date(v as string | Date);
      if (!Number.isNaN(d.getTime())) out[`${f}_local`] = formatLocal(d, tz);
    }
  }
  return out as T & Record<string, string | null>;
}
