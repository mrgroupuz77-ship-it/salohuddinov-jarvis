import { telegramChannel } from "eve/channels/telegram";
import type { SessionAuthContext } from "eve/context";

import { loadConfig } from "../lib/config.ts";
import { getDb } from "../lib/db.ts";
import { handleCallback, handleInboundMessage } from "../lib/inbound.ts";
import type { InboundMessage, PipelineDeps, TelegramPort } from "../lib/inbound.ts";
import { log } from "../lib/log.ts";
import { recordIntegrationEvent } from "../lib/store.ts";
import { ensureWebhook, webhookSecret } from "../lib/webhook.ts";
import type { WebhookCheck } from "../lib/webhook.ts";

const cfg = loadConfig();
const deps: PipelineDeps = { cfg, db: getDb };

export async function recordWebhook(check: WebhookCheck): Promise<void> {
  if (check.state === "skipped" || check.state === "already_ok") return;
  const detail = `${check.detail}${check.lastError ? `; Telegram oxirgi xatosi: ${check.lastError}` : ""}`;
  await getDb().then((db) => recordIntegrationEvent(db, "webhook", check.state === "error" ? "xato" : "ulangan", detail)).catch(() => undefined);
}

// Register the webhook as soon as the server loads this channel; the report
// schedule re-checks it every few minutes as a safety net.
void ensureWebhook().then(recordWebhook).catch(() => undefined);

const record = (state: "ulangan" | "xato", detail: string) =>
  getDb().then((db) => recordIntegrationEvent(db, "model", state, detail)).catch(() => undefined);

export default telegramChannel({
  botUsername: cfg.botUsername,
  // Same value that ensureWebhook() registers with Telegram.
  credentials: { webhookSecretToken: () => webhookSecret() ?? "" },
  // Only for local end-to-end tests against a mock Bot API; production uses the official endpoint.
  api: process.env.TELEGRAM_API_BASE_URL ? { apiBaseUrl: cfg.telegramApiBaseUrl } : undefined,
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf", "text/csv", "text/plain"],
    maxBytes: 10 * 1024 * 1024,
  },
  async onMessage(ctx, message) {
    try {
      const result = await handleInboundMessage(ctx.telegram as unknown as TelegramPort, message as unknown as InboundMessage, deps);
      return result ? { auth: result.auth as SessionAuthContext, context: result.context } : null;
    } catch (err) {
      log.error("inbound handler failed", { error: err instanceof Error ? err.message : String(err) });
      try {
        await ctx.telegram.post("Ichki xato bo‘ldi, xabaringizni qayta ishlay olmadim. /status ni tekshiring.");
      } catch {
        // ignore
      }
      return null;
    }
  },
  async onCallbackQuery(ctx, query) {
    try {
      await handleCallback(ctx.telegram as unknown as TelegramPort, query, deps);
    } catch (err) {
      log.error("callback handler failed", { error: err instanceof Error ? err.message : String(err) });
    }
  },
  events: {
    async "turn.started"(_data, channel) {
      await channel.telegram.startTyping();
    },
    async "message.completed"(data, channel) {
      if (data.finishReason !== "tool-calls" && data.message) {
        await channel.telegram.post(data.message);
        await record("ulangan", "javob olindi");
      }
    },
    async "turn.failed"(data, channel) {
      await record("xato", "turn failed");
      if (data.terminal) return;
      await channel.telegram.post("Xatolik bo‘ldi, so‘rovni oxiriga yetkaza olmadim. Qayta yozib ko‘ring. Takrorlansa — /status.");
    },
    async "session.failed"(_data, channel) {
      await record("xato", "session failed");
      await channel.telegram.post("Suhbat sessiyasi xato bilan to‘xtadi. Yangi xabar yozsangiz, yangi sessiya boshlanadi. Ma’lumotlar bazada saqlangan.");
    },
  },
});
