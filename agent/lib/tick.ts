// One scheduler wake-up: re-check the Telegram webhook, then send whatever
// report is due. Shared by the hourly schedule files in agent/schedules/tick/.
//
// Why 24 daily schedules instead of one "every 5 minutes"? Vercel's free
// (Hobby) plan only allows cron jobs that run once per day, each fired somewhere
// inside its hour. One daily job per hour gives an hourly wake-up that is valid
// on every host. The database decides what is due (owner's time zone,
// configurable times, pause, exactly-once per period), so an early, late or
// double wake-up never sends a report twice.

import { defineSchedule } from "eve/schedules";

import { loadConfig } from "./config.ts";
import { getDb } from "./db.ts";
import { log } from "./log.ts";
import { runDueReports } from "./scheduler.ts";
import { recordIntegrationEvent } from "./store.ts";
import { ensureWebhook } from "./webhook.ts";
import { recordWebhook } from "./webhook-status.ts";

export async function runTick(): Promise<void> {
  try {
    const db = await getDb();
    await recordWebhook(await ensureWebhook());
    await recordIntegrationEvent(db, "scheduler", "ulangan", "jadval uyg‘ondi");
    const result = await runDueReports({ db, cfg: loadConfig() });
    if (result.sent.length || result.failed.length || result.uncertain.length || result.skipped.length) {
      log.info("report dispatch", { ...result });
    }
  } catch (err) {
    log.error("report dispatch failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Cron for the wake-up at `hourUtc`. JARVIS_TICK_CRON overrides hour 0 (tests only). */
export function tickCron(hourUtc: number, env: Record<string, string | undefined> = process.env): string {
  const override = env.JARVIS_TICK_CRON?.trim();
  if (override && hourUtc === 0) return override;
  return `0 ${hourUtc} * * *`;
}

export function hourlyTick(hourUtc: number) {
  return defineSchedule({
    cron: tickCron(hourUtc),
    run({ waitUntil }) {
      waitUntil(runTick());
    },
  });
}
