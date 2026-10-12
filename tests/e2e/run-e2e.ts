// End-to-end check of the BUILT eve server: real webhook route, real channel,
// real agent loop, real tools and database — with Telegram and Anthropic
// replaced by local mocks. Run: npm run build:test && npm run test:e2e

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readdirSync } from "node:fs";

import { webhookSecret } from "../../agent/lib/webhook.ts";
import { startAnthropicMock, startTelegramMock } from "./mocks.ts";

// E2E_ROOT lets this run against a clean "container-like" copy of the project.
const ROOT = process.env.E2E_ROOT ? resolve(process.env.E2E_ROOT) : resolve(import.meta.dirname, "../..");
const OWNER = 111222333;
const STRANGER = 999888777;
const FAKE_TOKEN = "123456789:TEST_ONLY_fake_token_aaaaaaaaaaaaaaaaaaaa";
// No TELEGRAM_WEBHOOK_SECRET_TOKEN is configured: the server derives it from the token.
const SECRET = webhookSecret({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN })!;
const PUBLIC_DOMAIN = "jarvis-e2e.up.railway.app";
const RUNTIME_MODEL = "claude-runtime-model";
const FAKE_MODEL_KEY = "e2e-anthropic-key-not-real-123";

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 25_000): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  return undefined;
}

const tg = await startTelegramMock();
const ai = await startAnthropicMock((req) => {
  const messages = (req.messages ?? []) as Array<{ role: string; content: unknown }>;
  const last = messages[messages.length - 1];
  const lastJson = JSON.stringify(last?.content ?? "");
  if (lastJson.includes("tool_result") && lastJson.includes("tasdiq_kutilmoqda")) {
    return { kind: "text", text: "Post tasdiq uchun yuborildi. Hali hech narsa e’lon qilinmadi." };
  }
  if (lastJson.includes("tool_result")) {
    return { kind: "text", text: "Bajarildi: vazifa saqlandi.\nNatija: ertaga 15:00 — Aziza bilan uchrashuv.\nKeyingi qadam: tayyorgarlik savollarini yozib beraymi?" };
  }
  if (lastJson.toLowerCase().includes("kanalga post")) {
    return { kind: "tool", name: "approval_request", input: { action_type: "telegram_post", recipient: "@jarvis_test_kanal", summary: "Test post", text: "Salom, bu test post." } };
  }
  if (lastJson.includes("Aziza")) {
    return { kind: "tool", name: "task_create", input: { title: "Aziza bilan uchrashuv", due_at: "2026-10-13T15:00:00+05:00", priority: "yuqori" } };
  }
  return { kind: "text", text: "Labbay, bro." };
});

const dataDir = mkdtempSync(join(tmpdir(), "jarvis-e2e-"));
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  MODEL_ID: RUNTIME_MODEL, // the build used a different placeholder id
  ANTHROPIC_API_KEY: FAKE_MODEL_KEY,
  RAILWAY_PUBLIC_DOMAIN: PUBLIC_DOMAIN,
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.port}/v1`,
  TELEGRAM_BOT_TOKEN: FAKE_TOKEN,
  TELEGRAM_OWNER_USER_ID: String(OWNER),
  TELEGRAM_API_BASE_URL: `http://127.0.0.1:${tg.port}`,
  DATABASE_URL: `pglite:${dataDir}/db`,
  APP_TIMEZONE: "Asia/Tashkent",
  EVE_TELEMETRY_DISABLED: "1",
  TELEGRAM_PUBLISH_CHAT_IDS: "@jarvis_test_kanal",
};

let serverLog = "";
let server: ChildProcess | null = null;

async function startServer() {
  server = spawn("npx", ["eve", "start", "--host", "127.0.0.1", "--port", String(port)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  server.stdout!.on("data", (d) => (serverLog += d.toString()));
  server.stderr!.on("data", (d) => (serverLog += d.toString()));
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    try {
      const r = await fetch(`${base}/eve/v1/health`);
      if (r.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  return false;
}

async function stopServer() {
  if (!server) return;
  const proc = server;
  const exited = new Promise((r) => proc.once("exit", r));
  try {
    process.kill(-proc.pid!, "SIGTERM"); // whole process group (npx + eve + node server)
  } catch {
    proc.kill("SIGTERM");
  }
  await exited;
  await sleep(1000);
  server = null;
}

let updateId = 5000;
let messageId = 70;
const user = (id: number) => ({ id, is_bot: false, first_name: "Test", username: `u${id}` });
const msgUpdate = (from: number, text: string) => ({
  update_id: ++updateId,
  message: { message_id: ++messageId, from: user(from), chat: { id: from, type: "private", first_name: "Test" }, date: Math.floor(Date.now() / 1000), text },
});
const cbUpdate = (from: number, data: string) => ({
  update_id: ++updateId,
  callback_query: { id: `cb${updateId}`, from: user(from), chat_instance: "x", data, message: { message_id: 1, chat: { id: from, type: "private" }, date: 0, text: "x" } },
});

async function post(update: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-telegram-bot-api-secret-token"] = secret;
  return fetch(`${base}/eve/v1/telegram`, { method: "POST", headers, body: JSON.stringify(update) });
}

const sentTo = (chatId: number) => tg.sent().filter((c) => String(c.body.chat_id) === String(chatId));
const textOf = (c: { body: Record<string, unknown> }) => String(c.body.text ?? "");

try {
  check("server ishga tushdi (health 200)", await startServer(), serverLog.slice(-2000));

  const setHook = await waitFor(() => tg.calls.find((c) => c.path === "setWebhook"), 15_000);
  check(
    "server webhook’ni o‘zi o‘rnatdi (Railway domeni, hosila secret)",
    Boolean(setHook) && setHook!.body.url === `https://${PUBLIC_DOMAIN}/eve/v1/telegram` && setHook!.body.secret_token === SECRET,
    JSON.stringify(setHook?.body ?? null).replace(SECRET, "<secret>"),
  );

  const noSecret = await post(msgUpdate(OWNER, "salom"), null);
  check("secret token’siz webhook rad etiladi", noSecret.status === 401 || noSecret.status === 403, `status ${noSecret.status}`);
  const wrongSecret = await post(msgUpdate(OWNER, "salom"), "wrong");
  check("noto‘g‘ri secret rad etiladi", wrongSecret.status === 401 || wrongSecret.status === 403, `status ${wrongSecret.status}`);

  const r1 = await post(msgUpdate(STRANGER, "/projects"));
  await sleep(2500);
  check("begona: webhook tez 200 qaytaradi", r1.status === 200);
  check("begona: hech qanday javob yuborilmadi", sentTo(STRANGER).length === 0, JSON.stringify(sentTo(STRANGER)));
  check("begona: model chaqirilmadi", ai.requests.length === 0, `requests: ${ai.requests.length}`);

  await post(msgUpdate(OWNER, "/status"));
  const status = await waitFor(() => sentTo(OWNER).find((c) => textOf(c).includes("INTEGRATSIYALAR HOLATI")));
  check("/status deterministik javob (modelsiz)", Boolean(status) && ai.requests.length === 0, `ai requests ${ai.requests.length}`);

  const task = msgUpdate(OWNER, "Ertaga soat 15:00 da Aziza bilan uchrashuv bor. Vazifa qilib saqla.");
  const t0 = Date.now();
  const res = await post(task);
  const webhookMs = Date.now() - t0;
  check("webhook darhol javob beradi (<2 s)", res.status === 200 && webhookMs < 2000, `${webhookMs} ms`);
  const done = await waitFor(() => sentTo(OWNER).find((c) => textOf(c).includes("Bajarildi: vazifa saqlandi")), 40_000);
  check("model → task_create tool → Telegram javobi", Boolean(done), serverLog.slice(-3000));

  const firstReq = ai.requests[0] ?? {};
  check("model ID ishlash vaqtidagi sozlamadan olinadi (build qiymatidan emas)", firstReq.model === RUNTIME_MODEL, String(firstReq.model));
  const reqJson = JSON.stringify(firstReq);
  check("modelga Jarvis ko‘rsatmalari va kontekst fayllari boradi", reqJson.includes("Salohuddinov Jarvis") && reqJson.includes("Media Tizimlar Arxitektori"));
  check("modelga joriy vaqt konteksti boradi", reqJson.includes("jarvis_context") && reqJson.includes("Asia/Tashkent"));
  const toolNames = ((firstReq.tools ?? []) as Array<{ name?: string }>).map((t) => t.name);
  check("model faqat Jarvis tool’larini ko‘radi (bash/fayl yo‘q)", toolNames.includes("task_create") && toolNames.includes("approval_request") && !toolNames.includes("bash") && !toolNames.includes("write_file"), toolNames.join(","));
  check("kontent qoidalari har xabarga to‘liq yuborilmaydi (skill sifatida)", !reqJson.includes("70/20/10 + original uslub") && reqJson.includes("kontent-yozish"));
  const allModelTraffic = JSON.stringify(ai.requests);
  check("model kontekstiga token/secret chiqmaydi", !allModelTraffic.includes(FAKE_TOKEN) && !allModelTraffic.includes(SECRET) && !allModelTraffic.includes(FAKE_MODEL_KEY));

  const before = ai.requests.length;
  await post(task); // Telegram retry of the very same update
  await sleep(3000);
  check("takroriy update ikkinchi marta ishlanmaydi", ai.requests.length === before, `${before} → ${ai.requests.length}`);

  await post(msgUpdate(OWNER, "/today"));
  const today = await waitFor(() => sentTo(OWNER).find((c) => textOf(c).startsWith("BUGUN") && textOf(c).includes("Aziza bilan uchrashuv")));
  check("vazifa bazada: /today uni ko‘rsatadi (vaqt 15:00)", Boolean(today) && textOf(today!).includes("13.10.2026 15:00"), today ? textOf(today) : "");

  await post(cbUpdate(OWNER, "jv:r:daily"));
  const daily = await waitFor(() => sentTo(OWNER).find((c) => textOf(c).startsWith("KUNLIK HISOBOT")));
  check("“Hisobot → Kunlik” tugmasi haqiqiy hisobot yuboradi", Boolean(daily) && textOf(daily!).includes("NIMA QILDIK?"));

  // Approval flow: the model can only request; the server publishes after the button.
  await post(msgUpdate(OWNER, "Kanalga post qil: salom"));
  const prompt = await waitFor(() => sentTo(OWNER).find((c) => textOf(c).startsWith("TASDIQ KERAK")), 40_000);
  const keyboard = (prompt?.body.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } | undefined)?.inline_keyboard?.[0] ?? [];
  check("tasdiq xabari 3 tugma bilan keldi", keyboard.map((b) => b.text).join("|") === "✅ Tasdiqlash|✏️ Tahrirlash|❌ Bekor qilish", JSON.stringify(keyboard));
  const toChannel = () => tg.sent().filter((c) => c.body.chat_id === "@jarvis_test_kanal");
  await sleep(1500);
  check("tasdiqdan oldin kanalga hech narsa yuborilmadi", toChannel().length === 0);
  const okData = keyboard[0]?.callback_data ?? "";
  await post(cbUpdate(OWNER, okData));
  const published = await waitFor(() => toChannel()[0]);
  check("“Tasdiqlash”dan keyin aynan shu matn kanalga ketdi", Boolean(published) && textOf(published!) === "Salom, bu test post.");
  await post(cbUpdate(OWNER, okData));
  await sleep(1500);
  const answers = tg.calls.filter((c) => c.path === "answerCallbackQuery").map((c) => String(c.body.text ?? ""));
  check("ikkinchi bosish qayta yubormaydi", toChannel().length === 1 && answers.some((a) => a.includes("allaqachon hal qilingan")), answers.join(" | "));

  await stopServer();
  check("server qayta ishga tushdi", await startServer());
  await post(msgUpdate(OWNER, "/today"));
  const afterRestart = await waitFor(() => sentTo(OWNER).filter((c) => textOf(c).startsWith("BUGUN")).length >= 2 ? sentTo(OWNER).filter((c) => textOf(c).startsWith("BUGUN")).at(-1) : undefined);
  check("restartdan keyin vazifa saqlangan", Boolean(afterRestart) && textOf(afterRestart!).includes("Aziza bilan uchrashuv"));

  // In the container image .eve/.workflow-data is a symlink into the /data volume.
  if (process.env.E2E_WORKFLOW_DIR) {
    let workflowFiles = 0;
    try { workflowFiles = readdirSync(process.env.E2E_WORKFLOW_DIR, { recursive: true }).length; } catch { workflowFiles = 0; }
    check("sessiya ma’lumotlari volume papkasida (symlink orqali)", workflowFiles > 0, `files: ${workflowFiles}`);
  }
  check("server loglarida token/secret yo‘q", !serverLog.includes(FAKE_TOKEN) && !serverLog.includes(SECRET) && !serverLog.includes(FAKE_MODEL_KEY));
} finally {
  await stopServer();
  await tg.close();
  await ai.close();
  rmSync(dataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("\n--- server log tail ---\n" + serverLog.slice(-4000));
  process.exit(1);
}
