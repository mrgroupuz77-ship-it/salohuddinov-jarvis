// Stores the outcome of a webhook check so /status can show it.

import { getDb } from "./db.ts";
import { recordIntegrationEvent } from "./store.ts";
import type { WebhookCheck } from "./webhook.ts";

export async function recordWebhook(check: WebhookCheck): Promise<void> {
  if (check.state === "skipped" || check.state === "already_ok") return;
  const detail = `${check.detail}${check.lastError ? `; Telegram oxirgi xatosi: ${check.lastError}` : ""}`;
  await getDb()
    .then((db) => recordIntegrationEvent(db, "webhook", check.state === "error" ? "xato" : "ulangan", detail))
    .catch(() => undefined);
}
