import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { desiredWebhookUrl, ensureWebhook, resetWebhookStateForTests, webhookSecret } from "../../agent/lib/webhook.ts";
import { FAKE_BOT_TOKEN } from "../helpers.ts";

function fakeTelegram(currentUrl = "") {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const method = url.split("/").pop()!;
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ method, body });
    if (method === "setWebhook") currentUrl = body.url;
    const result = method === "getWebhookInfo" ? { url: currentUrl, pending_update_count: 0 } : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  };
  return { calls, fetch };
}

describe("Webhook o‘zini o‘zi ro‘yxatdan o‘tkazadi", () => {
  const env = { TELEGRAM_BOT_TOKEN: FAKE_BOT_TOKEN, RAILWAY_PUBLIC_DOMAIN: "jarvis.up.railway.app" };

  it("secret tokendan hosil qilinadi, token o‘zgarsa secret ham o‘zgaradi, aniq qiymat ustun", () => {
    const a = webhookSecret(env)!;
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.equal(a.includes("TEST_ONLY"), false);
    assert.notEqual(a, webhookSecret({ TELEGRAM_BOT_TOKEN: "987654321:other_token_bbbbbbbbbbbbbbbbbbbbbbbbbb" }));
    assert.equal(webhookSecret({ ...env, TELEGRAM_WEBHOOK_SECRET_TOKEN: "explicit" }), "explicit");
  });

  it("Railway domeni yoki PUBLIC_URL dan to‘g‘ri manzil", () => {
    assert.equal(desiredWebhookUrl(env), "https://jarvis.up.railway.app/eve/v1/telegram");
    assert.equal(desiredWebhookUrl({ PUBLIC_URL: "https://x.uz/" }), "https://x.uz/eve/v1/telegram");
    assert.equal(desiredWebhookUrl({}), undefined);
  });

  it("jarayon boshida bir marta o‘rnatadi, keyin faqat tekshiradi", async () => {
    resetWebhookStateForTests();
    const tg = fakeTelegram("https://old.example/eve/v1/telegram");
    const r1 = await ensureWebhook({ env, fetch: tg.fetch as never, now: 0 });
    assert.equal(r1.state, "set");
    const set = tg.calls.find((c) => c.method === "setWebhook")!;
    assert.equal(set.body.url, "https://jarvis.up.railway.app/eve/v1/telegram");
    assert.equal(set.body.secret_token, webhookSecret(env));
    assert.equal(set.body.drop_pending_updates, false, "messages sent during a deploy are kept");
    const r2 = await ensureWebhook({ env, fetch: tg.fetch as never, now: 60_000 });
    assert.equal(r2.state, "already_ok");
    assert.equal(tg.calls.filter((c) => c.method === "setWebhook").length, 1);
  });

  it("domen yoki token bo‘lmasa hech narsa qilmaydi", async () => {
    resetWebhookStateForTests();
    assert.equal((await ensureWebhook({ env: { TELEGRAM_BOT_TOKEN: FAKE_BOT_TOKEN } })).state, "skipped");
    assert.equal((await ensureWebhook({ env: { RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app" } })).state, "skipped");
    assert.equal((await ensureWebhook({ env: { TELEGRAM_BOT_TOKEN: FAKE_BOT_TOKEN, PUBLIC_URL: "http://insecure" } })).state, "skipped");
  });
});
