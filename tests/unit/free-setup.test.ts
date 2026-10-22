// Bepul yo‘l: Gemini free tier + Vercel Hobby + Neon Free.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveDatabaseUrl } from "../../agent/lib/config.ts";
import { migrate, openDb } from "../../agent/lib/db.ts";
import { collectStatuses } from "../../agent/lib/integrations.ts";
import { isQuotaError, modelKeyPresent, resolveModelProvider } from "../../agent/lib/model-config.ts";
import { redact } from "../../agent/lib/redact.ts";
import { tickCron } from "../../agent/lib/tick.ts";
import { desiredWebhookUrl, ensureWebhook, publicBaseUrl, resetWebhookStateForTests } from "../../agent/lib/webhook.ts";
import { memoryDb, testConfig } from "../helpers.ts";

describe("Model provayderi", () => {
  it("MODEL_ID bo‘yicha tanlanadi: gemini → google, claude → anthropic, vendor/model → gateway", () => {
    assert.equal(resolveModelProvider({ MODEL_ID: "gemini-3.8-flash" }), "google");
    assert.equal(resolveModelProvider({ MODEL_ID: "claude-haiku-5-5", ANTHROPIC_API_KEY: "x" }), "anthropic");
    assert.equal(resolveModelProvider({ MODEL_ID: "anthropic/claude-haiku-5.5" }), "gateway");
  });

  it("MODEL_PROVIDER ustun turadi; ID dan bilib bo‘lmasa — mavjud kalit, aks holda bepul Gemini", () => {
    assert.equal(resolveModelProvider({ MODEL_ID: "custom-model", MODEL_PROVIDER: "anthropic" }), "anthropic");
    assert.equal(resolveModelProvider({ MODEL_ID: "build-placeholder", ANTHROPIC_API_KEY: "x" }), "anthropic");
    assert.equal(resolveModelProvider({ MODEL_ID: "build-placeholder" }), "google");
  });

  it("kalit borligi provayderga qarab tekshiriladi (GEMINI_API_KEY ham qabul qilinadi)", () => {
    assert.equal(modelKeyPresent({ MODEL_ID: "gemini-3.8-flash" }), false);
    assert.equal(modelKeyPresent({ MODEL_ID: "gemini-3.8-flash", GEMINI_API_KEY: "k" }), true);
    assert.equal(modelKeyPresent({ MODEL_ID: "gemini-3.8-flash", GOOGLE_GENERATIVE_AI_API_KEY: "k" }), true);
    // Anthropic kaliti Gemini uchun hisoblanmaydi.
    assert.equal(modelKeyPresent({ MODEL_ID: "gemini-3.8-flash", ANTHROPIC_API_KEY: "k" }), false);
  });

  it("limit tugagan xatolar taniladi, oddiy xato limit deb ko‘rsatilmaydi", () => {
    assert.equal(isQuotaError("429 RESOURCE_EXHAUSTED: Quota exceeded for metric"), true);
    assert.equal(isQuotaError("Too Many Requests"), true);
    assert.equal(isQuotaError("tool input validation failed"), false);
    assert.equal(isQuotaError(undefined), false);
  });

  it("/status Gemini’ni va yetishmayotgan kalit nomini ko‘rsatadi", async () => {
    const db = await memoryDb();
    const cfg = testConfig({ MODEL_ID: "gemini-3.8-flash", ANTHROPIC_API_KEY: undefined, GEMINI_API_KEY: undefined, GOOGLE_GENERATIVE_AI_API_KEY: undefined });
    const statuses = await collectStatuses(cfg, db);
    const model = statuses.find((s) => s.key === "model")!;
    assert.match(model.label, /Gemini/);
    assert.equal(model.state, "ulanmagan");
    assert.match(model.detail, /GOOGLE_GENERATIVE_AI_API_KEY/);
    await db.close();
  });

  it("Google kaliti loglarda yashiriladi", () => {
    const fake = "AIza" + "B".repeat(35);
    assert.equal(redact(`key=${fake}`, []).includes(fake), false);
  });
});

describe("Vercel Hobby", () => {
  it("webhook faqat production domeniga o‘rnatiladi, preview deploy botni egallamaydi", () => {
    const prod = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "salohuddinov-jarvis.vercel.app" };
    assert.equal(publicBaseUrl(prod), "https://salohuddinov-jarvis.vercel.app");
    assert.equal(desiredWebhookUrl(prod), "https://salohuddinov-jarvis.vercel.app/eve/v1/telegram");
    assert.equal(publicBaseUrl({ ...prod, VERCEL_ENV: "preview" }), undefined);
    assert.equal(publicBaseUrl({ ...prod, PUBLIC_URL: "https://custom.example/" }), "https://custom.example");
  });

  it("preview’da webhook tekshiruvi Telegram’ga murojaat qilmaydi", async () => {
    resetWebhookStateForTests();
    let called = 0;
    const check = await ensureWebhook({
      env: { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app", TELEGRAM_BOT_TOKEN: "123456789:TEST_ONLY_fake_token_aaaaaaaaaaaaaaaaaaaa" },
      fetch: async () => {
        called++;
        return new Response("{}");
      },
    });
    assert.equal(check.state, "skipped");
    assert.match(check.detail, /preview/);
    assert.equal(called, 0);
  });

  it("baza manzili: DATABASE_URL, bo‘lmasa POSTGRES_URL (Neon integratsiyasi)", () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: "postgres://a", POSTGRES_URL: "postgres://b" }), "postgres://a");
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: "postgres://b" }), "postgres://b");
    assert.equal(resolveDatabaseUrl({}), null);
  });

  it("24 ta jadval fayli: har biri kuniga bir marta, har soatga bittadan (Hobby qoidasi)", () => {
    const dir = join(import.meta.dirname, "../../agent/schedules/tick");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
    assert.equal(files.length, 24);
    const hours = files.map((f) => Number(/hourlyTick\((\d+)\)/.exec(readFileSync(join(dir, f), "utf8"))?.[1]));
    assert.deepEqual(hours, Array.from({ length: 24 }, (_, h) => h));
    for (const h of hours) {
      const cron = tickCron(h, {});
      // Kuniga bir marta: daqiqa va soat aniq, qolganlari *.
      assert.match(cron, /^0 \d{1,2} \* \* \*$/);
      assert.equal(Number(cron.split(" ")[1]), h);
    }
    // Sinov uchun override faqat h00 ga ta’sir qiladi.
    assert.equal(tickCron(0, { JARVIS_TICK_CRON: "* * * * *" }), "* * * * *");
    assert.equal(tickCron(5, { JARVIS_TICK_CRON: "* * * * *" }), "0 5 * * *");
  });

  it("bir vaqtda ishga tushgan ikki nusxa migratsiyani bir marta bajaradi", async () => {
    const db = await openDb("pglite:memory");
    const [a, b] = await Promise.all([migrate(db), migrate(db)]);
    assert.equal(a.length + b.length > 0, true);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM projects");
    assert.equal(rows[0]!.n, 6);
    const again = await migrate(db);
    assert.deepEqual(again, []);
    await db.close();
  });
});
