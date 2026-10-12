import { defineSchedule } from "eve/schedules";

import { loadConfig } from "../lib/config.ts";
import { getDb } from "../lib/db.ts";
import { log } from "../lib/log.ts";
import { runDueReports } from "../lib/scheduler.ts";
import { recordIntegrationEvent } from "../lib/store.ts";
import { ensureWebhook } from "../lib/webhook.ts";

// Wakes every 5 minutes; the database decides which report is due (owner's
// time zone, configurable times, pause, exactly-once per period).
export default defineSchedule({
  cron: "*/5 * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        try {
          const db = await getDb();
          const hook = await ensureWebhook();
          if (hook.state === "set" || hook.state === "error") {
            await recordIntegrationEvent(db, "webhook", hook.state === "error" ? "xato" : "ulangan", hook.detail);
          }
          const result = await runDueReports({ db, cfg: loadConfig() });
          if (result.sent.length || result.failed.length || result.uncertain.length || result.skipped.length) {
            log.info("report dispatch", { ...result });
          }
        } catch (err) {
          log.error("report dispatch failed", { error: err instanceof Error ? err.message : String(err) });
        }
      })(),
    );
  },
});
