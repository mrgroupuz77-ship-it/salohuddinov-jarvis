// Server-side authorization. Tools call `assertAuthorized` before touching
// data, so access control never depends on the prompt alone.

import type { AppConfig } from "./config.ts";
import { loadConfig } from "./config.ts";

export interface PrincipalLike {
  authenticator?: string;
  issuer?: string;
  principalId?: string;
  principalType?: string;
  attributes?: Record<string, unknown>;
}

export interface InboundIdentity {
  chat: { id: string; type: string; title?: string };
  from?: { id: string; isBot: boolean; username?: string };
  messageId: string;
  messageThreadId?: number;
}

export type GateVerdict = "owner" | "stranger" | "group" | "ignore" | "setup";

/** Who sent this update and what may happen with it. Pure function. */
export function gate(message: InboundIdentity, cfg: AppConfig): GateVerdict {
  if (!message.from || message.from.isBot || message.chat.type === "channel") return "ignore";
  if (message.chat.type !== "private") return cfg.allowGroups && cfg.ownerUserId === message.from.id ? "owner" : "group";
  if (!cfg.ownerUserId) return "setup";
  return message.from.id === cfg.ownerUserId ? "owner" : "stranger";
}

/** Session principal for the verified owner (same shape as eve's Telegram default). */
export function ownerPrincipal(message: InboundIdentity): PrincipalLike & {
  authenticator: string;
  issuer: string;
  principalId: string;
  principalType: "user";
  attributes: Record<string, string>;
} {
  const from = message.from!;
  const attributes: Record<string, string> = {
    chat_id: message.chat.id,
    chat_type: message.chat.type,
    message_id: message.messageId,
    user_id: from.id,
    role: "owner",
  };
  if (from.username) attributes.username = from.username;
  return {
    authenticator: "telegram-webhook",
    issuer: "telegram",
    principalId: `telegram:${from.id}`,
    principalType: "user",
    attributes,
  };
}

export function isAuthorizedPrincipal(auth: PrincipalLike | null | undefined, cfg: AppConfig): boolean {
  if (!auth) return false;
  switch (auth.authenticator) {
    case "telegram-webhook":
      return Boolean(cfg.ownerUserId) && auth.principalId === `telegram:${cfg.ownerUserId}`;
    case "app":
      return auth.principalId === "eve:app" && auth.principalType === "runtime";
    case "local-dev":
      return cfg.isDev;
    case "http-basic":
      return cfg.adminBasicAuth;
    case "vercel-oidc":
      // Internal runtime callers of this same Vercel project only; never end users.
      return auth.principalType === "runtime" || auth.principalType === "service";
    default:
      return false;
  }
}

export class NotAuthorizedError extends Error {}

/** For tools: `assertAuthorized(ctx.session.auth.current)`. */
export function assertAuthorized(auth: PrincipalLike | null | undefined, cfg: AppConfig = loadConfig()): void {
  if (!isAuthorizedPrincipal(auth, cfg)) {
    throw new NotAuthorizedError("Ruxsat yo‘q: bu amal faqat tasdiqlangan egasi uchun.");
  }
}
