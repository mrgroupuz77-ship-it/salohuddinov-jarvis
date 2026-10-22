// Runtime configuration. Every value comes from the environment; nothing secret
// is ever logged or returned to the model. Secrets are only *checked for
// presence* here (see `secretPresent`).

import { modelKeyPresent, resolveModelProvider } from "./model-config.ts";
import type { ModelProvider } from "./model-config.ts";

export interface SttConfig {
  provider: "none" | "openai-compatible";
  baseUrl: string;
  model: string | null;
  language: string;
  apiKeyPresent: boolean;
  maxSeconds: number;
}

export interface AppConfig {
  ownerUserId: string | null;
  ownerIdInvalid: boolean;
  timezone: string;
  allowGroups: boolean;
  databaseUrl: string | null;
  telegramTokenPresent: boolean;
  webhookSecretPresent: boolean;
  telegramApiBaseUrl: string;
  botUsername: string | undefined;
  publishChatIds: string[];
  modelIdPresent: boolean;
  modelKeyPresent: boolean;
  modelProvider: ModelProvider;
  modelId: string | null;
  callsEnabled: boolean;
  stt: SttConfig;
  isDev: boolean;
  adminBasicAuth: boolean;
}

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env: Env = process.env): AppConfig {
  const ownerRaw = clean(env.TELEGRAM_OWNER_USER_ID);
  const ownerValid = ownerRaw !== undefined && /^\d{3,20}$/.test(ownerRaw);
  const tz = clean(env.APP_TIMEZONE) ?? "Asia/Tashkent";
  const sttProvider = clean(env.STT_PROVIDER) === "openai-compatible" ? "openai-compatible" : "none";

  return {
    ownerUserId: ownerValid ? ownerRaw : null,
    ownerIdInvalid: ownerRaw !== undefined && !ownerValid,
    timezone: isValidTimezone(tz) ? tz : "Asia/Tashkent",
    allowGroups: clean(env.TELEGRAM_ALLOW_GROUPS) === "true",
    databaseUrl: resolveDatabaseUrl(env),
    telegramTokenPresent: Boolean(clean(env.TELEGRAM_BOT_TOKEN)),
    // Explicit secret, or one derived from the bot token (see lib/webhook.ts).
    webhookSecretPresent: Boolean(clean(env.TELEGRAM_WEBHOOK_SECRET_TOKEN) || clean(env.TELEGRAM_BOT_TOKEN)),
    telegramApiBaseUrl: (clean(env.TELEGRAM_API_BASE_URL) ?? "https://api.telegram.org").replace(/\/+$/, ""),
    botUsername: clean(env.TELEGRAM_BOT_USERNAME)?.replace(/^@/, ""),
    publishChatIds: (clean(env.TELEGRAM_PUBLISH_CHAT_IDS) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    modelIdPresent: Boolean(clean(env.MODEL_ID)),
    modelKeyPresent: modelKeyPresent(env),
    modelProvider: resolveModelProvider(env),
    modelId: clean(env.MODEL_ID) ?? null,
    callsEnabled: clean(env.CALLS_ENABLED) === "true",
    stt: {
      provider: sttProvider,
      baseUrl: (clean(env.STT_BASE_URL) ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: clean(env.STT_MODEL) ?? null,
      language: clean(env.STT_LANGUAGE) ?? "uz",
      apiKeyPresent: Boolean(clean(env.STT_API_KEY)),
      maxSeconds: Number(clean(env.STT_MAX_SECONDS) ?? 300) || 300,
    },
    isDev: env.EVE_DEV === "1",
    adminBasicAuth: Boolean(clean(env.EVE_ADMIN_USER) && clean(env.EVE_ADMIN_PASSWORD)),
  };
}

/**
 * Database location: DATABASE_URL, or POSTGRES_URL (set by some hosting
 * integrations, e.g. Neon on Vercel). Never falls back to a local file on a
 * serverless host, where the filesystem does not persist.
 */
export function resolveDatabaseUrl(env: Env = process.env): string | null {
  return clean(env.DATABASE_URL) ?? clean(env.POSTGRES_URL) ?? null;
}

/** Reads a secret only at the moment it is needed. Never store the result. */
export function readSecret(name: string, env: Env = process.env): string | undefined {
  return clean(env[name]);
}

export function sttReady(cfg: AppConfig): boolean {
  return cfg.stt.provider !== "none" && cfg.stt.apiKeyPresent && cfg.stt.model !== null;
}
