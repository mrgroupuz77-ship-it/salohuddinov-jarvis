// Prints what is configured — without printing any secret value.
//   node --env-file=.env scripts/check-env.ts

import { loadConfig, sttReady } from "../agent/lib/config.ts";
import { MODEL_KEY_NAMES, PROVIDER_LABEL } from "../agent/lib/model-config.ts";
import { publicBaseUrl } from "../agent/lib/webhook.ts";

const cfg = loadConfig();
const row = (ok: boolean, label: string, hint = "") => console.log(`${ok ? "✅" : "⚪"} ${label}${!ok && hint ? ` — ${hint}` : ""}`);

row(cfg.telegramTokenPresent, "TELEGRAM_BOT_TOKEN", "BotFather’dan yangi token");
row(cfg.webhookSecretPresent, "Webhook secret (aniq yoki tokendan hosil qilinadi)");
console.log(`ℹ️ Webhook manzili: ${publicBaseUrl() ?? "aniqlanmagan (PUBLIC_URL, Railway yoki Vercel production domeni)"}`);
row(Boolean(cfg.ownerUserId), "TELEGRAM_OWNER_USER_ID", cfg.ownerIdInvalid ? "faqat raqam bo‘lsin" : "botga /start yozib bilib oling");
row(Boolean(cfg.databaseUrl), "DATABASE_URL / POSTGRES_URL", "postgres://… (Neon) yoki pglite:./data/jarvis");
row(cfg.modelIdPresent, "MODEL_ID", "masalan gemini-3.8-flash");
console.log(`ℹ️ Model provayderi: ${PROVIDER_LABEL[cfg.modelProvider]}`);
row(cfg.modelKeyPresent, MODEL_KEY_NAMES[cfg.modelProvider].join(" yoki "));
console.log(`ℹ️ APP_TIMEZONE=${cfg.timezone}`);
row(sttReady(cfg), "STT (ovozli xabar)", "ixtiyoriy, 5-bosqich");
row(cfg.publishChatIds.length > 0, "TELEGRAM_PUBLISH_CHAT_IDS", "ixtiyoriy");
console.log(`ℹ️ CALLS_ENABLED=${cfg.callsEnabled}`);
