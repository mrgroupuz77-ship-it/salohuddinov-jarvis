// Acceptance checks from the Jarvis prompt (section 18), run without network.
// Numbers in test names match the prompt's list.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeApproval, parseApprovalCallback, requestApproval, renderApproval } from "../../agent/lib/approvals.ts";
import { assertAuthorized, isAuthorizedPrincipal, ownerPrincipal } from "../../agent/lib/auth.ts";
import { checkCall, placeCall } from "../../agent/lib/adapters/calls.ts";
import { assertSamePeriod, formatMetric, instagram, pctChange } from "../../agent/lib/adapters/instagram.ts";
import { migrate, openDb } from "../../agent/lib/db.ts";
import { collectStatuses } from "../../agent/lib/integrations.ts";
import { handleCallback, handleInboundMessage } from "../../agent/lib/inbound.ts";
import { collectSecretValues, looksLikeSecret, redact } from "../../agent/lib/redact.ts";
import { buildReport, compareCounts } from "../../agent/lib/reports.ts";
import { runDueReports } from "../../agent/lib/scheduler.ts";
import {
  approvalHash,
  createApproval,
  createTask,
  decideApproval,
  defaultSettings,
  getSettings,
  grantStanding,
  listTasks,
  saveFact,
  updateSettings,
  updateTask,
} from "../../agent/lib/store.ts";
import { TelegramSendError, callBotApi } from "../../agent/lib/telegram-api.ts";
import { findAmbiguousTimes, formatLocal } from "../../agent/lib/time.ts";
import { FAKE_BOT_TOKEN, OWNER, STRANGER, callback, fakeTelegram, memoryDb, message, postText, tempDir, testConfig } from "../helpers.ts";

const deps = (db: Awaited<ReturnType<typeof memoryDb>>, cfgOverrides = {}) => ({ cfg: testConfig(cfgOverrides), db: async () => db });

describe("1. Begona foydalanuvchi", () => {
  it("begona xabari modelga ham, bazaga ham yetmaydi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const result = await handleInboundMessage(tg, message(STRANGER, "/projects"), deps(db));
    assert.equal(result, null);
    assert.equal(tg.posts.length, 0, "strangers get no data back");
    const { rows } = await db.query("SELECT count(*)::int AS n FROM processed_updates");
    assert.equal((rows[0] as { n: number }).n, 0);
  });

  it("begona odam tasdiq tugmasini bosa olmaydi", async () => {
    const db = await memoryDb();
    const a = await createApproval(db, { action_type: "telegram_post", recipient: "@kanal", summary: "test", payload: { text: "salom" } });
    const tg = fakeTelegram();
    await handleCallback(tg, callback(STRANGER, `jv:a:${a.id}:${a.payload_hash.slice(0, 12)}:ok`), deps(db));
    assert.equal(tg.answers[0]?.text, "Ruxsat yo‘q.");
    const { rows } = await db.query<{ status: string }>("SELECT status FROM approvals WHERE id = $1", [a.id]);
    assert.equal(rows[0]?.status, "kutilmoqda");
  });

  it("tool’lar faqat egani o‘tkazadi (server tekshiruvi)", () => {
    const cfg = testConfig();
    const owner = ownerPrincipal(message(OWNER, "x"));
    assert.equal(isAuthorizedPrincipal(owner, cfg), true);
    assert.equal(isAuthorizedPrincipal({ ...owner, principalId: `telegram:${STRANGER}` }, cfg), false);
    assert.equal(isAuthorizedPrincipal({ authenticator: "local-dev", principalId: "local-dev" }, cfg), false, "local-dev only in eve dev");
    assert.equal(isAuthorizedPrincipal({ authenticator: "app", principalId: "eve:app", principalType: "runtime" }, cfg), true);
    assert.throws(() => assertAuthorized(null, cfg));
  });

  it("guruh xabarlari boshlang‘ich holatda o‘chirilgan", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const m = message(OWNER, "salom", { chat: { id: "-100123", type: "supergroup" } });
    assert.equal(await handleInboundMessage(tg, m, deps(db)), null);
    assert.equal(tg.posts.length, 0);
  });

  it("ega sozlanmagan bo‘lsa birinchi yozgan odam ega bo‘lmaydi, faqat o‘z ID’sini ko‘radi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const r = await handleInboundMessage(tg, message(STRANGER, "/start"), deps(db, { TELEGRAM_OWNER_USER_ID: undefined }));
    assert.equal(r, null);
    assert.match(postText(tg.posts[0]!), new RegExp(STRANGER));
    assert.match(postText(tg.posts[0]!), /TELEGRAM_OWNER_USER_ID/);
  });
});

describe("2. Takroriy webhook", () => {
  it("bir xabar ikki marta kelsa, bitta marta ishlanadi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const m = message(OWNER, "ertaga taklifni tayyorlash kerak");
    const first = await handleInboundMessage(tg, m, deps(db));
    const second = await handleInboundMessage(tg, { ...m }, deps(db));
    assert.ok(first, "first delivery reaches the agent");
    assert.equal(second, null, "retry is dropped");
  });

  it("bir turn ichidagi takroriy task_create bitta vazifa yaratadi", async () => {
    const db = await memoryDb();
    const a = await createTask(db, { title: "Taklif tayyorlash", source_key: "turn1:abc" });
    const b = await createTask(db, { title: "Taklif tayyorlash", source_key: "turn1:abc" });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(a.task.id, b.task.id);
    assert.equal((await listTasks(db)).length, 1);
  });
});

describe("3. Qayta ishga tushish", () => {
  it("vazifa, xotira, sozlama va hisobot jadvali saqlanib qoladi", async () => {
    const dir = tempDir();
    const url = `pglite:${dir}/db`;
    let db = await openDb(url);
    await migrate(db);
    await createTask(db, { title: "Restart sinovi" });
    await saveFact(db, { kind: "afzallik", subject: "uslub", content: "Qisqa javob", status: "foydalanuvchi_bergan", source: "test" });
    await updateSettings(db, { reports: { ...defaultSettings().reports, daily: { enabled: true, time: "22:30" } } });
    const now = new Date("2026-10-12T17:31:00Z"); // 22:31 Tashkent
    const sent: string[] = [];
    const send = async (_c: string, t: string) => { sent.push(t); return { messageId: "1" }; };
    await runDueReports({ db, cfg: testConfig(), now, send });
    await db.close();

    db = await openDb(url); // "restart"
    await migrate(db);
    assert.equal((await listTasks(db))[0]?.title, "Restart sinovi");
    assert.equal((await getSettings(db)).reports.daily.time, "22:30");
    const again = await runDueReports({ db, cfg: testConfig(), now: new Date("2026-10-12T17:36:00Z"), send });
    assert.equal(sent.length, 1, "report not re-sent after restart");
    assert.deepEqual(again.sent, []);
    await db.close();
  });
});

describe("4. Vaqt zonasi va noaniq vaqt", () => {
  it("+05:00 vaqt to‘g‘ri saqlanadi va Toshkent vaqtida ko‘rsatiladi", async () => {
    const db = await memoryDb();
    const { task } = await createTask(db, { title: "Uchrashuv", due_at: "2026-10-13T15:00:00+05:00" });
    assert.equal(new Date(task.due_at!).toISOString(), "2026-10-13T10:00:00.000Z");
    assert.equal(formatLocal(new Date(task.due_at!), "Asia/Tashkent"), "13.10.2026 15:00");
  });

  it("“ertaga soat 3” noaniq deb belgilanadi va modelga ogohlantirish boradi", async () => {
    assert.ok(findAmbiguousTimes("ertaga soat 3 da uchrashuv").length > 0);
    assert.equal(findAmbiguousTimes("ertaga soat 15:00 da uchrashuv").length, 0);
    assert.equal(findAmbiguousTimes("kechqurun soat 7 da").length, 0);
    assert.equal(findAmbiguousTimes("3 ta video tayyorla").length, 0);
    const db = await memoryDb();
    const r = await handleInboundMessage(fakeTelegram(), message(OWNER, "ertaga soat 3 da Aziza bilan uchrashuv"), deps(db));
    assert.ok(r);
    assert.match(r.context.join("\n"), /vaqt noaniq/);
    assert.match(r.context.join("\n"), /Asia\/Tashkent/);
  });
});

describe("5. Ovozli topshiriq", () => {
  const voiceMsg = () => message(OWNER, "", { raw: { voice: { file_id: "F1", duration: 12, mime_type: "audio/ogg" } } });

  it("STT ulanmagan bo‘lsa — halol aytadi va matn so‘raydi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    assert.equal(await handleInboundMessage(tg, voiceMsg(), deps(db)), null);
    assert.match(postText(tg.posts[0]!), /STT ulanmagan/);
  });

  it("STT ulangan bo‘lsa — transkript ko‘rsatiladi va ism/sana/raqamni tasdiqlatish talab qilinadi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const m = voiceMsg();
    const r = await handleInboundMessage(tg, m, {
      cfg: testConfig({ STT_PROVIDER: "openai-compatible", STT_MODEL: "test-stt", STT_API_KEY: "test-stt-key" }),
      db: async () => db,
      transcribe: async () => "Ertaga soat 15:00 da Aziza bilan uchrashuv",
    });
    assert.ok(r);
    assert.equal(m.text, "Ertaga soat 15:00 da Aziza bilan uchrashuv", "model receives the transcript as the message");
    assert.match(postText(tg.posts[0]!), /Eshitganim/);
    assert.match(r.context.join("\n"), /tasdiqlat/);
  });
});

describe("6. Hisobot raqamlari manbaga mos", () => {
  it("bo‘sh bazada raqam to‘qilmaydi, yo‘q ma’lumot ochiq ko‘rsatiladi", async () => {
    const db = await memoryDb();
    const text = await buildReport(db, "daily", { timezone: "Asia/Tashkent", now: new Date("2026-10-12T16:00:00Z") });
    assert.match(text, /NIMA QILDIK\?/);
    assert.match(text, /NIMA BO‘LDI\?/);
    assert.match(text, /ENDI NIMA QILAMIZ\?/);
    assert.match(text, /tugallangan vazifa qayd etilmagan/);
    assert.match(text, /Instagram ko‘rsatkichlari: ma’lumot yo‘q/);
    assert.match(text, /Manba: Jarvis bazasi/);
  });

  it("faqat dalil bilan tugallangan ish “NIMA QILDIK”ga kiradi", async () => {
    const db = await memoryDb();
    const { task: done } = await createTask(db, { title: "Kosimov ssenariy", project: "kosimov_study" });
    await createTask(db, { title: "Rejadagi ish" });
    await assert.rejects(updateTask(db, { id: done.id, status: "tugallangan" }), /dalil kerak/);
    await updateTask(db, { id: done.id, status: "tugallangan", evidence: "https://docs.example/script" });
    const text = await buildReport(db, "daily", { timezone: "Asia/Tashkent" });
    const didSection = text.split("NIMA BO‘LDI?")[0]!;
    assert.match(didSection, /Kosimov ssenariy/);
    assert.doesNotMatch(didSection, /Rejadagi ish/);
  });

  it("asosi nol bo‘lsa foiz hisoblanmaydi", () => {
    assert.equal(compareCounts(3, 0), "3 (oldingi davr: 0 — foiz hisoblanmaydi)");
    assert.equal(compareCounts(6, 3), "6 (oldingi davr: 3, +3, +100%)");
  });
});

describe("7. Tasdiqsiz tashqi harakat yo‘q", () => {
  it("post so‘rovi faqat tasdiq tugmalarini yuboradi, postni emas", async () => {
    const db = await memoryDb();
    const cfg = testConfig({ TELEGRAM_PUBLISH_CHAT_IDS: "@kanalim" });
    const prompts: Array<{ chat: string; markup: Record<string, unknown> }> = [];
    const posts: string[] = [];
    const r = await requestApproval(
      { db, cfg, ownerChatId: OWNER, sendPrompt: async (chat, _t, markup) => { prompts.push({ chat, markup }); return { messageId: "77" }; }, send: async (c, t) => { posts.push(`${c}:${t}`); return { messageId: "1" }; } },
      { action_type: "telegram_post", recipient: "@kanalim", summary: "Yangi post", payload: { text: "Salom!" } },
    );
    assert.equal(r.mode, "awaiting_approval");
    assert.equal(posts.length, 0, "nothing published before approval");
    assert.equal(prompts[0]?.chat, OWNER);
    const buttons = JSON.stringify(prompts[0]?.markup);
    assert.match(buttons, /Tasdiqlash/);
    assert.match(buttons, /Tahrirlash/);
    assert.match(buttons, /Bekor qilish/);
  });

  it("aniq doimiy ruxsat bo‘lsa, qayta tasdiq so‘ralmaydi", async () => {
    const db = await memoryDb();
    const cfg = testConfig({ TELEGRAM_PUBLISH_CHAT_IDS: "@kanalim" });
    await grantStanding(db, "telegram_post", "@kanalim");
    const posts: string[] = [];
    let prompted = false;
    const r = await requestApproval(
      { db, cfg, ownerChatId: OWNER, sendPrompt: async () => { prompted = true; return { messageId: "1" }; }, send: async (c, t) => { posts.push(`${c}:${t}`); return { messageId: "9" }; } },
      { action_type: "telegram_post", recipient: "@kanalim", summary: "Post", payload: { text: "Matn" } },
    );
    assert.equal(r.mode, "executed_with_standing_grant");
    assert.equal(prompted, false);
    assert.deepEqual(posts, ["@kanalim:Matn"]);
  });

  it("ruxsatli ro‘yxatda bo‘lmagan kanalga tasdiq bilan ham yuborilmaydi", async () => {
    const db = await memoryDb();
    const a = await createApproval(db, { action_type: "telegram_post", recipient: "@begona", summary: "x", payload: { text: "y" } });
    const d = await decideApproval(db, a.id, a.payload_hash, "approve");
    assert.ok(d.ok);
    let sent = false;
    const outcome = await executeApproval({ db, cfg: testConfig({ TELEGRAM_PUBLISH_CHAT_IDS: "@kanalim" }), send: async () => { sent = true; return { messageId: "1" }; } }, d.approval);
    assert.equal(outcome.status, "xato");
    assert.equal(sent, false);
  });
});

describe("8. Matn o‘zgarsa eski tasdiq ishlamaydi", () => {
  it("versiya hash matn yoki oluvchi bilan o‘zgaradi", () => {
    const base = { action_type: "telegram_post", recipient: "@k", summary: "s", payload: { text: "A" } };
    assert.notEqual(approvalHash(base), approvalHash({ ...base, payload: { text: "B" } }));
    assert.notEqual(approvalHash(base), approvalHash({ ...base, recipient: "@k2" }));
    assert.equal(approvalHash(base), approvalHash({ ...base, summary: "boshqa izoh" }), "summary is not part of the action");
  });

  it("eski versiya tugmasi va tahrirlangan tasdiq yuborishga yetmaydi", async () => {
    const db = await memoryDb();
    const cfg = testConfig({ TELEGRAM_PUBLISH_CHAT_IDS: "@kanalim" });
    const old = await createApproval(db, { action_type: "telegram_post", recipient: "@kanalim", summary: "v1", payload: { text: "Eski matn" } });
    const tg = fakeTelegram();
    // Owner presses "Tahrirlash" on v1.
    await handleCallback(tg, callback(OWNER, `jv:a:${old.id}:${old.payload_hash.slice(0, 12)}:ed`), { cfg, db: async () => db });
    // Pressing "Tasdiqlash" on the same old message now fails.
    const tg2 = fakeTelegram();
    await handleCallback(tg2, callback(OWNER, `jv:a:${old.id}:${old.payload_hash.slice(0, 12)}:ok`), { cfg, db: async () => db });
    assert.match(tg2.answers[0]?.text ?? "", /allaqachon hal qilingan/);
    // A forged callback with a different hash is rejected too.
    const v2 = await createApproval(db, { action_type: "telegram_post", recipient: "@kanalim", summary: "v2", payload: { text: "Yangi matn" } });
    const forged = await decideApproval(db, v2.id, old.payload_hash.slice(0, 12), "approve");
    assert.equal(forged.ok, false);
    const buttons = (renderApproval(v2, "Asia/Tashkent").replyMarkup.inline_keyboard as Array<Array<{ callback_data: string }>>)[0]!;
    const parsed = parseApprovalCallback(buttons[0]!.callback_data);
    assert.equal(parsed?.id, v2.id);
    assert.ok(v2.payload_hash.startsWith(parsed!.hash), "button carries the current version hash");
  });
});

describe("9. Instagram uzilganda soxta statistika yo‘q", () => {
  it("adapter xato beradi, metrika “ma’lumot yo‘q”, nol bazadan foiz chiqmaydi", async () => {
    await assert.rejects(instagram.fetchAccountInsights("@salohuddinovv", "day"), /ulanmagan/);
    assert.match(formatMetric({ name: "qamrov", value: null, period: "day", unit: "", account: "@a", source: "Meta", fetchedAt: new Date() }), /ma’lumot yo‘q/);
    assert.equal(pctChange(0, 120), null);
    assert.equal(pctChange(null, 120), null);
    assert.throws(() => assertSamePeriod([
      { name: "a", value: 1, period: "day", unit: "", account: "x", source: "s", fetchedAt: new Date() },
      { name: "b", value: 2, period: "lifetime", unit: "", account: "x", source: "s", fetchedAt: new Date() },
    ]));
    const statuses = await collectStatuses(testConfig(), await memoryDb());
    assert.equal(statuses.find((s) => s.key === "instagram")?.state, "ulanmagan");
  });
});

describe("12. Telefon qo‘ng‘irog‘i", () => {
  it("o‘chirilgan bo‘lsa qo‘ng‘iroq qilinmaydi va “qildim” deyilmaydi", async () => {
    const cfg = testConfig();
    const s = defaultSettings();
    const check = checkCall(cfg, s, { to: "+998901234567", reason: "uyg‘otish", explicitlyScheduled: true }, new Date());
    assert.equal(check.ok, false);
    await assert.rejects(placeCall(), /ulanmagan/);
  });

  it("yoqilganda ham faqat ruxsatli raqam va tinch vaqtdan tashqari", () => {
    const cfg = testConfig({ CALLS_ENABLED: "true" });
    const s = defaultSettings();
    const env = { CALLS_ALLOWED_NUMBER: "+998901234567" };
    const day = new Date("2026-10-12T07:00:00Z"); // 12:00 Tashkent
    const night = new Date("2026-10-12T20:00:00Z"); // 01:00 Tashkent
    assert.equal(checkCall(cfg, s, { to: "+998900000000", reason: "x", explicitlyScheduled: false }, day, env).ok, false);
    assert.equal(checkCall(cfg, s, { to: "+998901234567", reason: "x", explicitlyScheduled: false }, day, env).ok, true);
    assert.equal(checkCall(cfg, s, { to: "+998901234567", reason: "x", explicitlyScheduled: false }, night, env).ok, false);
    assert.equal(checkCall(cfg, s, { to: "+998901234567", reason: "uyg‘otish", explicitlyScheduled: true }, night, env).ok, true);
  });
});

describe("13. Pauza", () => {
  it("/pause rejalashtirilgan hisobotni to‘xtatadi, /resume kunlik faqat bittasini yoqadi", async () => {
    const db = await memoryDb();
    const cfg = testConfig();
    const tg = fakeTelegram();
    await handleInboundMessage(tg, message(OWNER, "/pause"), { cfg, db: async () => db });
    assert.equal((await getSettings(db)).paused, true);
    const sent: string[] = [];
    const send = async (_c: string, t: string) => { sent.push(t); return { messageId: "1" }; };
    const r1 = await runDueReports({ db, cfg, now: new Date("2026-10-12T16:02:00Z"), send }); // 21:02
    assert.equal(sent.length, 0);
    assert.deepEqual(r1.skipped, ["owner:daily:2026-10-12"]);

    await handleInboundMessage(tg, message(OWNER, "/resume kunlik"), { cfg, db: async () => db });
    const s = await getSettings(db);
    assert.equal(s.paused, true);
    assert.deepEqual(s.paused_exceptions, ["daily"]);
    const r2 = await runDueReports({ db, cfg, now: new Date("2026-10-13T16:01:00Z"), send }); // next day 21:01
    assert.deepEqual(r2.sent, ["owner:daily:2026-10-13"]);
  });
});

describe("14. Tokenlar oqmaydi", () => {
  it("redact token, kalit va DB parolini yashiradi", () => {
    const secrets = collectSecretValues({ TELEGRAM_BOT_TOKEN: FAKE_BOT_TOKEN, ANTHROPIC_API_KEY: "sk-ant-test-abcdefghijklmnop" });
    const line = `GET https://api.telegram.org/bot${FAKE_BOT_TOKEN}/sendMessage key=sk-ant-test-abcdefghijklmnop postgres://jarvis:supersecret@db:5432/x`;
    const out = redact(line, secrets);
    assert.doesNotMatch(out, /TEST_ONLY_fake_token/);
    assert.doesNotMatch(out, /sk-ant-test/);
    assert.doesNotMatch(out, /supersecret/);
    // Shape-based redaction works even without knowing the value.
    assert.doesNotMatch(redact("token 987654321:AAAAbbbbCCCCddddEEEEffffGGGGhhhhIIII", []), /AAAAbbbb/);
  });

  it("xotiraga maxfiy ma’lumot saqlanmaydi", async () => {
    const db = await memoryDb();
    assert.equal(looksLikeSecret("bot token 987654321:AAAAbbbbCCCCddddEEEEffffGGGGhhhhIIII", []), true);
    await assert.rejects(
      saveFact(db, { kind: "fakt", subject: "bot", content: "token: 987654321:AAAAbbbbCCCCddddEEEEffffGGGGhhhhIIII", status: "tasdiqlangan", source: "chat" }),
      /maxfiy/,
    );
    await assert.rejects(saveFact(db, { kind: "fakt", subject: "x", content: "parol: qwerty123", status: "tasdiqlangan", source: "chat" }), /maxfiy/);
  });

  it("Telegram API xatosida URL ichidagi token xabarga chiqmaydi", async () => {
    process.env.TELEGRAM_BOT_TOKEN = FAKE_BOT_TOKEN;
    const failingFetch = async (url: string) => { throw new Error(`connect ECONNREFUSED ${url}`); };
    await assert.rejects(
      callBotApi("sendMessage", { chat_id: 1, text: "x" }, { fetch: failingFetch as never }),
      (err: unknown) => err instanceof TelegramSendError && err.kind === "uncertain" && !err.message.includes("TEST_ONLY_fake_token"),
    );
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("integratsiya holati hech qachon kalit qiymatini ko‘rsatmaydi", async () => {
    const statuses = await collectStatuses(testConfig(), await memoryDb());
    const dump = JSON.stringify(statuses);
    assert.doesNotMatch(dump, /TEST_ONLY_fake_token|test-key-not-real|test-webhook-secret/);
  });
});
