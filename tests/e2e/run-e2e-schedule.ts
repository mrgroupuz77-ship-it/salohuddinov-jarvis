// Proves the proactive path on the BUILT server: eve's Nitro scheduler fires
// the wake-up schedule (agent/schedules/tick/h00.ts → agent/lib/tick.ts), which
// sends one real daily report to the owner and never a second one for the
// same period. In production the 24 tick files wake once an hour; this test
// builds with JARVIS_TICK_CRON="* * * * *" so h00 fires every minute
// (npm run test:e2e:schedule does the build). Takes ~2–3 minutes.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { migrate, openDb } from "../../agent/lib/db.ts";
import { updateSettings } from "../../agent/lib/store.ts";
import { zonedParts } from "../../agent/lib/time.ts";
import { startTelegramMock } from "./mocks.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const OWNER = "111222333";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tg = await startTelegramMock();
const dataDir = mkdtempSync(join(tmpdir(), "jarvis-sched-"));
const url = `pglite:${dataDir}/db`;

// Seed: daily report time = one minute ago (Tashkent), so the next tick sends it.
const seed = await openDb(url);
await migrate(seed);
const p = zonedParts(new Date(Date.now() - 60_000), "Asia/Tashkent");
const hm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
await updateSettings(seed, { reports: { morning: { enabled: false, time: "09:00" }, daily: { enabled: true, time: hm }, weekly: { enabled: false, time: "19:00", weekday: 0 }, monthly: { enabled: false, time: "10:00", day: 1 } } });
await seed.close();

const port = 3990 + Math.floor(Math.random() * 9);
const server = spawn("npx", ["eve", "start", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: ROOT,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    MODEL_ID: "gemini-test-model",
    GEMINI_API_KEY: "not-used",
    TELEGRAM_BOT_TOKEN: "123456789:TEST_ONLY_fake_token_aaaaaaaaaaaaaaaaaaaa",
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "sched-secret-123",
    TELEGRAM_OWNER_USER_ID: OWNER,
    TELEGRAM_API_BASE_URL: `http://127.0.0.1:${tg.port}`,
    DATABASE_URL: url,
    EVE_TELEMETRY_DISABLED: "1",
  },
});
let log = "";
server.stdout!.on("data", (d) => (log += d));
server.stderr!.on("data", (d) => (log += d));

let ok = false;
let duplicates = false;
try {
  const reports = () => tg.sent().filter((c) => String(c.body.chat_id) === OWNER && String(c.body.text).startsWith("KUNLIK HISOBOT"));
  const deadline = Date.now() + 6.5 * 60_000;
  while (Date.now() < deadline && reports().length === 0) await sleep(2000);
  ok = reports().length === 1;
  if (ok) {
    // Wait for one more scheduler tick: the same period must not be sent again.
    const nextTick = Date.now() + 5.2 * 60_000;
    while (Date.now() < nextTick) await sleep(5000);
    duplicates = reports().length > 1;
  }
  console.log(`${ok ? "PASS" : "FAIL"} scheduler o‘zi kunlik hisobotni egaga yubordi (vaqt ${hm} Toshkent)`);
  if (ok) console.log(`${duplicates ? "FAIL" : "PASS"} keyingi tick’da shu davr qayta yuborilmadi`);
  if (ok) console.log("--- yuborilgan hisobot ---\n" + String(reports()[0]!.body.text));
} finally {
  try { process.kill(-server.pid!, "SIGTERM"); } catch { server.kill("SIGTERM"); }
  await sleep(1500);
  await tg.close();
  rmSync(dataDir, { recursive: true, force: true });
}
if (!ok || duplicates) {
  console.log(log.slice(-3000));
  process.exit(1);
}
