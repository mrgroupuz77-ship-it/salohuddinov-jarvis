import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleInboundMessage } from "../../agent/lib/inbound.ts";
import { dueReports, runDueReports } from "../../agent/lib/scheduler.ts";
import { defaultSettings, getSettings } from "../../agent/lib/store.ts";
import { TelegramSendError } from "../../agent/lib/telegram-api.ts";
import { isoWeekKey, monthRange, weekRange, zonedTimeToUtc } from "../../agent/lib/time.ts";
import { OWNER, fakeTelegram, memoryDb, message, postText, testConfig } from "../helpers.ts";

describe("Vaqt yordamchilari", () => {
  it("Toshkent devor soati UTC ga to‘g‘ri o‘tadi", () => {
    assert.equal(zonedTimeToUtc(2026, 10, 13, 9, 0, "Asia/Tashkent").toISOString(), "2026-10-13T04:00:00.000Z");
    assert.equal(zonedTimeToUtc(2026, 3, 29, 10, 0, "Europe/Berlin").toISOString(), "2026-03-29T08:00:00.000Z", "DST-aware for other zones");
  });

  it("hafta dushanbadan boshlanadi, oy hisoboti oldingi kalendar oy", () => {
    const now = new Date("2026-10-11T14:05:00Z"); // Sunday 19:05 Tashkent
    const w = weekRange(now, "Asia/Tashkent");
    assert.equal(w.start.toISOString(), "2026-10-04T19:00:00.000Z"); // Mon 5 Oct 00:00 Tashkent
    assert.equal(isoWeekKey(now, "Asia/Tashkent"), "2026-W41");
    const m = monthRange(new Date("2026-10-01T05:10:00Z"), "Asia/Tashkent", -1);
    assert.equal(m.month, 9);
  });
});

describe("Jadval (dispatcher)", () => {
  it("boshlang‘ich jadval: 09:00, 21:00, yakshanba 19:00, oyning 1-kuni 10:00 (Toshkent)", () => {
    const s = defaultSettings();
    const at = (iso: string) => dueReports(s, new Date(iso)).map((d) => d.dedupeKey);
    assert.deepEqual(at("2026-10-12T04:01:00Z"), ["owner:morning:2026-10-12"]);
    assert.deepEqual(at("2026-10-12T16:00:00Z"), ["owner:daily:2026-10-12"]);
    assert.deepEqual(at("2026-10-11T14:00:00Z"), ["owner:weekly:2026-W41"]);
    // At 10:00 the 09:00 brief is still inside its grace window; the dedupe key prevents a second send.
    assert.deepEqual(at("2026-11-01T05:00:00Z"), ["owner:morning:2026-11-01", "owner:monthly:2026-10"]);
    assert.deepEqual(at("2026-10-12T03:59:00Z"), [], "not before the time");
    assert.deepEqual(at("2026-10-12T08:00:00Z"), [], "not after the 3h grace window");
  });

  it("bir vaqtda kelgan hisobotlar bitta xabarga birlashadi", async () => {
    const db = await memoryDb();
    const sent: string[] = [];
    await runDueReports({ db, cfg: testConfig(), now: new Date("2026-11-01T05:01:00Z"), send: async (_c, t) => { sent.push(t); return { messageId: "1" }; } });
    assert.equal(sent.length, 1);
    assert.match(sent[0]!, /BUGUN/);
    assert.match(sent[0]!, /OYLIK HISOBOT — oktabr 2026/);
  });

  it("parallel ikki ishga tushish ham bitta hisobot yuboradi", async () => {
    const db = await memoryDb();
    const sent: string[] = [];
    const send = async (_c: string, t: string) => { sent.push(t); return { messageId: String(sent.length) }; };
    const now = new Date("2026-10-12T16:03:00Z");
    await Promise.all([runDueReports({ db, cfg: testConfig(), now, send }), runDueReports({ db, cfg: testConfig(), now, send })]);
    assert.equal(sent.length, 1);
  });

  it("yuborish holati noaniq bo‘lsa ko‘r-ko‘rona qayta yuborilmaydi", async () => {
    const db = await memoryDb();
    let calls = 0;
    const send = async () => { calls++; throw new TelegramSendError("uncertain", "timeout", false); };
    await runDueReports({ db, cfg: testConfig(), now: new Date("2026-10-12T16:01:00Z"), send });
    await runDueReports({ db, cfg: testConfig(), now: new Date("2026-10-12T16:30:00Z"), send });
    assert.equal(calls, 1);
    const { rows } = await db.query<{ status: string }>("SELECT status FROM report_runs");
    assert.equal(rows[0]?.status, "noaniq");
  });

  it("aniq xato bo‘lsa cheklangan marta, oraliq bilan qayta urinadi", async () => {
    const db = await memoryDb();
    let calls = 0;
    const send = async () => { calls++; throw new TelegramSendError("definite", "Bad Gateway", true); };
    await runDueReports({ db, cfg: testConfig(), now: new Date("2026-10-12T16:01:00Z"), send });
    await runDueReports({ db, cfg: testConfig(), now: new Date("2026-10-12T16:02:00Z"), send });
    assert.equal(calls, 1, "no immediate retry");
    await db.query("UPDATE report_runs SET updated_at = now() - interval '11 minutes'");
    await runDueReports({ db, cfg: testConfig(), now: new Date("2026-10-12T16:20:00Z"), send });
    assert.equal(calls, 2, "retried after the delay");
  });

  it("ega ID si yo‘q bo‘lsa hech kimga yuborilmaydi", async () => {
    const db = await memoryDb();
    let calls = 0;
    await runDueReports({ db, cfg: testConfig({ TELEGRAM_OWNER_USER_ID: undefined }), now: new Date("2026-10-12T16:01:00Z"), send: async () => { calls++; return { messageId: "1" }; } });
    assert.equal(calls, 0);
  });
});

describe("Buyruqlar va menyu", () => {
  it("/start vaqt zonasini ko‘rsatadi va menyu klaviaturasini beradi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    await handleInboundMessage(tg, message(OWNER, "/start"), { cfg: testConfig(), db: async () => db });
    const first = tg.posts[0] as { text: string; reply_markup: { keyboard: unknown[] } };
    assert.match(first.text, /Asia\/Tashkent/);
    assert.equal(first.reply_markup.keyboard.length, 4);
  });

  it("menyu tugmasi “Loyihalar” modelga bormasdan javob beradi va 6 ta loyiha “aniqlanmagan”", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const r = await handleInboundMessage(tg, message(OWNER, "Loyihalar"), { cfg: testConfig(), db: async () => db });
    assert.equal(r, null);
    const text = postText(tg.posts[0]!);
    assert.match(text, /Holati aniqlanmagan/);
    for (const name of ["kosimov_study", "inFranchise", "Jurabek Kulnazarov", "bozorbuva", "Oscar/Sergeli Auto", "Aziza cosmetolog"]) assert.ok(text.includes(name), name);
  });

  it("/status ulanmagan integratsiyalarni ochiq ko‘rsatadi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    await handleInboundMessage(tg, message(OWNER, "/status"), { cfg: testConfig(), db: async () => db });
    const text = postText(tg.posts[0]!);
    assert.match(text, /Google Calendar/);
    assert.match(text, /Instagram/);
    assert.match(text, /o‘chirilgan — Telefon/);
    assert.match(text, /Bot API bilan mumkin emas/);
  });

  it("“Kontent” tugmasi modelga kontent skill eslatmasi bilan boradi", async () => {
    const db = await memoryDb();
    const r = await handleInboundMessage(fakeTelegram(), message(OWNER, "Kontent"), { cfg: testConfig(), db: async () => db });
    assert.ok(r);
    assert.match(r.context.join("\n"), /kontent-yozish/);
  });

  it("model sozlanmagan bo‘lsa buyruqlar ishlaydi, erkin matn halol rad etiladi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    const r = await handleInboundMessage(tg, message(OWNER, "salom"), { cfg: testConfig({ ANTHROPIC_API_KEY: undefined }), db: async () => db });
    assert.equal(r, null);
    assert.match(postText(tg.posts[0]!), /modeli ulanmagan/);
  });

  it("/allow faqat buyruq orqali doimiy ruxsat beradi", async () => {
    const db = await memoryDb();
    const tg = fakeTelegram();
    await handleInboundMessage(tg, message(OWNER, "/allow telegram_post @kanalim"), { cfg: testConfig(), db: async () => db });
    assert.match(postText(tg.posts[0]!), /Doimiy ruxsat berildi/);
    await handleInboundMessage(tg, message(OWNER, "/revoke telegram_post @kanalim"), { cfg: testConfig(), db: async () => db });
    assert.match(postText(tg.posts[1]!), /bekor qilindi/);
  });

  it("sozlama noto‘g‘ri bo‘lsa saqlanmaydi", async () => {
    const db = await memoryDb();
    const { updateSettings } = await import("../../agent/lib/store.ts");
    await assert.rejects(updateSettings(db, { timezone: "Mars/Olympus" }), /Vaqt zonasi/);
    assert.equal((await getSettings(db)).timezone, "Asia/Tashkent");
  });
});
