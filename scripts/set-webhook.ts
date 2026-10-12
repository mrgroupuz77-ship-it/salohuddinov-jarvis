// Manual webhook registration (the server also does this by itself on start).
// Reads secrets from the environment and never prints them.
//   PUBLIC_URL=https://your-app.up.railway.app npm run webhook:set

import { callBotApi } from "../agent/lib/telegram-api.ts";
import { desiredWebhookUrl, ensureWebhook } from "../agent/lib/webhook.ts";

if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
  console.error("TELEGRAM_BOT_TOKEN yo‘q (.env yoki hosting sozlamasi).");
  process.exit(1);
}
const url = desiredWebhookUrl();
if (!url) {
  console.error("PUBLIC_URL (https://...) kerak.");
  process.exit(1);
}

const me = await callBotApi("getMe", {}).catch((err: Error) => {
  console.error(`Token ishlamadi: ${err.message}`);
  process.exit(1);
});
const bot = me.result as { username?: string; id?: number };
console.log(`Bot: @${bot.username} (id ${bot.id})`);

const result = await ensureWebhook();
console.log(`${result.state}: ${result.detail}${result.url ? ` → ${result.url}` : ""}${result.lastError ? ` · oxirgi xato: ${result.lastError}` : ""}`);
process.exit(result.state === "error" ? 1 : 0);
