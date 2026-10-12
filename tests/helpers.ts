import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../agent/lib/config.ts";
import { loadConfig } from "../agent/lib/config.ts";
import type { Db } from "../agent/lib/db.ts";
import { migrate, openDb } from "../agent/lib/db.ts";
import type { InboundCallback, InboundMessage, TelegramPort } from "../agent/lib/inbound.ts";

export const OWNER = "111222333";
export const STRANGER = "999888777";
// Clearly fake values for tests only.
export const FAKE_BOT_TOKEN = "123456789:TEST_ONLY_fake_token_aaaaaaaaaaaaaaaaaaaa";

export async function memoryDb(): Promise<Db> {
  const db = await openDb("pglite:memory");
  await migrate(db);
  return db;
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "jarvis-test-"));
}

export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    TELEGRAM_OWNER_USER_ID: OWNER,
    TELEGRAM_BOT_TOKEN: FAKE_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "test-webhook-secret-123",
    APP_TIMEZONE: "Asia/Tashkent",
    DATABASE_URL: "pglite:memory",
    MODEL_ID: "test-model",
    ANTHROPIC_API_KEY: "test-key-not-real",
    ...overrides,
  });
}

export function message(from: string, text: string, extra: Partial<InboundMessage> = {}): InboundMessage {
  return {
    text,
    caption: "",
    attachments: [],
    raw: {},
    chat: { id: from, type: "private" },
    from: { id: from, isBot: false, username: "u" + from },
    messageId: String(Math.floor(Math.random() * 1e9)),
    ...extra,
  };
}

export function callback(from: string, data: string, messageId = "500"): InboundCallback {
  return { id: `cb-${Math.random()}`, data, from: { id: from, isBot: false }, message: { messageId, chat: { id: from } } };
}

export interface FakeTelegram extends TelegramPort {
  posts: Array<string | { text: string; reply_markup?: Record<string, unknown> }>;
  answers: Array<{ text?: string }>;
  edits: Array<{ messageId: number | string; text: string }>;
  typing: number;
}

export function fakeTelegram(): FakeTelegram {
  const t: FakeTelegram = {
    posts: [],
    answers: [],
    edits: [],
    typing: 0,
    async post(m) {
      t.posts.push(m);
      return { id: String(t.posts.length) };
    },
    async startTyping() {
      t.typing++;
    },
    async answerCallbackQuery(input) {
      t.answers.push({ text: input.text });
      return {};
    },
    async editMessageText(input) {
      t.edits.push({ messageId: input.messageId, text: input.text });
      return {};
    },
  };
  return t;
}

export const postText = (p: string | { text: string }) => (typeof p === "string" ? p : p.text);
