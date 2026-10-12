// Minimal Bot API client for sends that happen outside a channel turn
// (scheduled reports, approval prompts, approved posts). The token is read at
// call time from the environment and never leaves this module.

import { readSecret } from "./config.ts";
import { redact } from "./redact.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** definite = Telegram answered with an error (safe to reason about); uncertain = we don't know if it was delivered. */
export class TelegramSendError extends Error {
  kind: "definite" | "uncertain";
  retryable: boolean;
  constructor(kind: "definite" | "uncertain", message: string, retryable: boolean) {
    super(redact(message));
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface SendOptions {
  replyMarkup?: Record<string, unknown>;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  disablePreview?: boolean;
  /** Where to read TELEGRAM_BOT_TOKEN from (defaults to process.env). */
  env?: Record<string, string | undefined>;
}

export const TELEGRAM_TEXT_LIMIT = 4096;

export function splitForTelegram(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function callBotApi(method: string, body: Record<string, unknown>, opts: SendOptions = {}): Promise<Record<string, unknown>> {
  const token = readSecret("TELEGRAM_BOT_TOKEN", opts.env);
  if (!token) throw new TelegramSendError("definite", "TELEGRAM_BOT_TOKEN sozlanmagan.", false);
  const base = (opts.baseUrl ?? process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? (globalThis.fetch as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await doFetch(`${base}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Network failure or timeout: the request may or may not have reached Telegram.
    throw new TelegramSendError("uncertain", `Telegram ${method}: tarmoq xatosi (${err instanceof Error ? err.message : String(err)})`, false);
  } finally {
    clearTimeout(timer);
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok !== true) {
    const desc = typeof json?.description === "string" ? json.description : `HTTP ${res.status}`;
    const retryable = res.status === 429 || res.status >= 500;
    throw new TelegramSendError(res.status >= 500 ? "uncertain" : "definite", `Telegram ${method}: ${desc}`, retryable);
  }
  return json;
}

export async function sendText(chatId: string, text: string, opts: SendOptions = {}): Promise<{ messageId: string }> {
  const chunks = splitForTelegram(text);
  let firstId = "";
  for (const [i, chunk] of chunks.entries()) {
    const json = await callBotApi("sendMessage", {
      chat_id: chatId,
      text: chunk,
      link_preview_options: { is_disabled: opts.disablePreview ?? true },
      ...(i === chunks.length - 1 && opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
    }, opts);
    const result = json.result as { message_id?: number } | undefined;
    if (i === 0) firstId = String(result?.message_id ?? "");
  }
  return { messageId: firstId };
}
