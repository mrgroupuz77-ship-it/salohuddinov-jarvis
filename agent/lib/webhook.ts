// Self-registering Telegram webhook. The server tells Telegram where to send
// updates, so nobody has to run a command with the token by hand.
//
// - Public URL: PUBLIC_URL, or Railway's automatic RAILWAY_PUBLIC_DOMAIN.
// - Secret header: TELEGRAM_WEBHOOK_SECRET_TOKEN, or (if unset) derived from the
//   bot token with HMAC — secret as long as the token is, and it changes
//   automatically when the token is revoked.

import { createHmac } from "node:crypto";

import { readSecret } from "./config.ts";
import { log } from "./log.ts";
import { callBotApi } from "./telegram-api.ts";
import type { FetchLike } from "./telegram-api.ts";

type Env = Record<string, string | undefined>;

export const WEBHOOK_PATH = "/eve/v1/telegram";
export const ALLOWED_UPDATES = ["message", "callback_query"];

export const BOT_COMMANDS = [
  { command: "today", description: "Bugungi reja" },
  { command: "projects", description: "Loyihalar" },
  { command: "clients", description: "Mijozlar" },
  { command: "content", description: "Kontent tayyorlash" },
  { command: "report", description: "Hisobot" },
  { command: "approvals", description: "Kutilayotgan tasdiqlar" },
  { command: "status", description: "Integratsiyalar holati" },
  { command: "settings", description: "Sozlamalar" },
  { command: "pause", description: "Proaktiv xabarlarni to‘xtatish" },
  { command: "resume", description: "Proaktiv xabarlarni yoqish" },
];

export function webhookSecret(env: Env = process.env): string | undefined {
  const explicit = env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.trim();
  if (explicit) return explicit;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return undefined;
  return createHmac("sha256", token).update("salohuddinov-jarvis/telegram-webhook/v1").digest("hex");
}

export function publicBaseUrl(env: Env = process.env): string | undefined {
  const explicit = env.PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const railway = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway.replace(/\/+$/, "")}`;
  return undefined;
}

export function desiredWebhookUrl(env: Env = process.env): string | undefined {
  const base = publicBaseUrl(env);
  return base ? `${base}${WEBHOOK_PATH}` : undefined;
}

export interface WebhookCheck {
  state: "set" | "already_ok" | "skipped" | "error";
  url?: string;
  detail: string;
  lastError?: string;
  pending?: number;
}

let registeredThisProcess = false;
let lastCheckAt = 0;

/** Test hook. */
export function resetWebhookStateForTests(): void {
  registeredThisProcess = false;
  lastCheckAt = 0;
}

/**
 * Makes sure Telegram points at this server. Registers once per process start
 * (a revoked/rotated token changes the derived secret), then re-checks the URL
 * at most every `recheckMs`.
 */
export async function ensureWebhook(opts: { env?: Env; fetch?: FetchLike; now?: number; recheckMs?: number } = {}): Promise<WebhookCheck> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const url = desiredWebhookUrl(env);
  const secret = webhookSecret(env);
  if (!readSecret("TELEGRAM_BOT_TOKEN", env)) return { state: "skipped", detail: "TELEGRAM_BOT_TOKEN yo‘q" };
  if (!url) return { state: "skipped", detail: "PUBLIC_URL yoki RAILWAY_PUBLIC_DOMAIN yo‘q" };
  if (!url.startsWith("https://")) return { state: "skipped", detail: "Webhook faqat https:// manzil bilan ishlaydi" };
  if (registeredThisProcess && now - lastCheckAt < (opts.recheckMs ?? 30 * 60_000)) {
    return { state: "already_ok", url, detail: "yaqinda tekshirilgan" };
  }
  const api = (method: string, body: Record<string, unknown>) => callBotApi(method, body, { fetch: opts.fetch, baseUrl: env.TELEGRAM_API_BASE_URL, env });
  try {
    const info = (await api("getWebhookInfo", {})).result as { url?: string; last_error_message?: string; pending_update_count?: number };
    lastCheckAt = now;
    if (registeredThisProcess && info.url === url) {
      return { state: "already_ok", url, detail: "webhook to‘g‘ri", lastError: info.last_error_message, pending: info.pending_update_count };
    }
    await api("setWebhook", { url, secret_token: secret, allowed_updates: ALLOWED_UPDATES, drop_pending_updates: false });
    await api("setMyCommands", { commands: BOT_COMMANDS }).catch(() => undefined);
    registeredThisProcess = true;
    log.info("telegram webhook registered", { url });
    return { state: "set", url, detail: "webhook o‘rnatildi", lastError: info.last_error_message, pending: info.pending_update_count };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn("telegram webhook check failed", { error: detail });
    return { state: "error", url, detail };
  }
}
