// Proactive report dispatcher. Called every few minutes by the eve schedule.
// Exactly-once per (report type + period) is enforced by the database
// primary key, so several instances or a restart cannot double-send.

import type { AppConfig } from "./config.ts";
import type { Db } from "./db.ts";
import { log } from "./log.ts";
import { buildReport } from "./reports.ts";
import type { ReportKind, Settings } from "./store.ts";
import { claimReportRun, finishReportRun, getSettings, reclaimFailedReportRun } from "./store.ts";
import { TelegramSendError, sendText } from "./telegram-api.ts";
import { dateKey, isoWeekKey, monthRange, parseHm, zonedParts, zonedTimeToUtc } from "./time.ts";

export const GRACE_MS = 3 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 10 * 60 * 1000;

export interface DueReport {
  kind: ReportKind;
  dedupeKey: string;
  periodKey: string;
  scheduledAt: Date;
}

export function dueReports(settings: Settings, now: Date): DueReport[] {
  const tz = settings.timezone;
  const p = zonedParts(now, tz);
  const due: DueReport[] = [];
  const order: ReportKind[] = ["morning", "daily", "weekly", "monthly"];
  for (const kind of order) {
    const r = settings.reports[kind];
    if (!r?.enabled) continue;
    const hm = parseHm(r.time);
    if (!hm) continue;
    if (kind === "weekly" && p.weekday !== (r.weekday ?? 0)) continue;
    if (kind === "monthly" && p.day !== (r.day ?? 1)) continue;
    const scheduledAt = zonedTimeToUtc(p.year, p.month, p.day, hm.hour, hm.minute, tz);
    const delta = now.getTime() - scheduledAt.getTime();
    if (delta < 0 || delta > GRACE_MS) continue;
    let periodKey: string;
    if (kind === "weekly") periodKey = isoWeekKey(now, tz);
    else if (kind === "monthly") {
      const prev = monthRange(now, tz, -1);
      periodKey = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
    } else periodKey = dateKey(now, tz);
    due.push({ kind, periodKey, dedupeKey: `owner:${kind}:${periodKey}`, scheduledAt });
  }
  return due;
}

export interface DispatchDeps {
  db: Db;
  cfg: AppConfig;
  now?: Date;
  send?: (chatId: string, text: string) => Promise<{ messageId: string }>;
}

export interface DispatchResult {
  sent: string[];
  skipped: string[];
  failed: string[];
  uncertain: string[];
}

export async function runDueReports(deps: DispatchDeps): Promise<DispatchResult> {
  const result: DispatchResult = { sent: [], skipped: [], failed: [], uncertain: [] };
  const { db, cfg } = deps;
  if (!cfg.ownerUserId) return result;
  const now = deps.now ?? new Date();
  const settings = await getSettings(db, cfg.timezone);
  const send = deps.send ?? ((chatId: string, text: string) => sendText(chatId, text));

  const claimed: DueReport[] = [];
  for (const d of dueReports(settings, now)) {
    if (settings.paused && !settings.paused_exceptions.includes(d.kind)) {
      if (await claimReportRun(db, d.dedupeKey, d.kind, d.periodKey, "otkazildi")) result.skipped.push(d.dedupeKey);
      continue;
    }
    const fresh = await claimReportRun(db, d.dedupeKey, d.kind, d.periodKey);
    const retry = fresh ? false : await reclaimFailedReportRun(db, d.dedupeKey, MAX_ATTEMPTS, RETRY_DELAY_MS);
    if (fresh || retry) claimed.push(d);
  }
  if (!claimed.length) return result;

  // Several reports due at once (e.g. after downtime) go out as one message.
  const texts: string[] = [];
  for (const d of claimed) texts.push(await buildReport(db, d.kind, { timezone: settings.timezone, now }));
  const body = texts.join("\n\n— — —\n\n");

  try {
    const { messageId } = await send(cfg.ownerUserId, body);
    for (const d of claimed) {
      await finishReportRun(db, d.dedupeKey, "yuborildi", { messageId });
      result.sent.push(d.dedupeKey);
    }
  } catch (err) {
    const uncertain = err instanceof TelegramSendError ? err.kind === "uncertain" : true;
    const message = err instanceof Error ? err.message : String(err);
    for (const d of claimed) {
      // Uncertain delivery is never retried blindly: the owner may already have it.
      await finishReportRun(db, d.dedupeKey, uncertain ? "noaniq" : "xato", { error: message });
      (uncertain ? result.uncertain : result.failed).push(d.dedupeKey);
    }
    log.warn("report send failed", { keys: claimed.map((d) => d.dedupeKey), uncertain, error: message });
  }
  return result;
}
