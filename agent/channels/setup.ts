import { defineChannel, GET } from "eve/channels";

import { redact } from "../lib/redact.ts";
import { ensureWebhook } from "../lib/webhook.ts";
import { recordWebhook } from "../lib/webhook-status.ts";

// GET /jarvis/webhook — makes Telegram point at this deployment right after a
// deploy, without waiting for the next hourly wake-up. Safe to expose: it only
// registers the URL this server already owns, with the secret derived from the
// bot token, is throttled per process, and returns no secret.
export default defineChannel({
  routes: [
    GET("/jarvis/webhook", async () => {
      const check = await ensureWebhook();
      await recordWebhook(check);
      return Response.json({
        state: check.state,
        url: check.url ?? null,
        detail: redact(check.detail),
        telegramLastError: check.lastError ? redact(check.lastError) : null,
        pendingUpdates: check.pending ?? null,
      });
    }),
  ],
});
