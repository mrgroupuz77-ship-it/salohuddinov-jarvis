// Approval flow for external actions. The model can only *request*; the
// server executes after the owner presses "Tasdiqlash" on the exact version.

import type { AppConfig } from "./config.ts";
import type { Db } from "./db.ts";
import type { ApprovalInput, ApprovalRow } from "./store.ts";
import {
  StoreError,
  createApproval,
  decideApproval,
  finishApproval,
  hasStandingGrant,
  setApprovalMessageId,
  supersedeApproval,
} from "./store.ts";
import { TelegramSendError, sendText } from "./telegram-api.ts";
import { formatLocal } from "./time.ts";

export const ACTION_TYPES = {
  telegram_post: "Telegram kanal/guruhga post",
  client_message: "Mijozga xabar",
  meeting_invite: "Uchrashuv taklifi",
  file_share: "Uchinchi shaxsga fayl",
  ad_spend: "Reklama xarajati",
  payment: "To‘lov",
  data_delete: "Ma’lumotni o‘chirish",
  account_change: "Akkaunt sozlamasini o‘zgartirish",
} as const;

export type ActionType = keyof typeof ACTION_TYPES;

/** Which action types this deployment can actually execute today. */
export function executableActions(cfg: AppConfig): Set<ActionType> {
  const set = new Set<ActionType>();
  if (cfg.publishChatIds.length && cfg.telegramTokenPresent) set.add("telegram_post");
  return set;
}

export const CALLBACK_PREFIX = "jv";

export function approvalCallback(a: Pick<ApprovalRow, "id" | "payload_hash">, decision: "ok" | "ed" | "no"): string {
  return `${CALLBACK_PREFIX}:a:${a.id}:${a.payload_hash.slice(0, 12)}:${decision}`;
}

export function parseApprovalCallback(data: string): { id: number; hash: string; decision: "approve" | "edit" | "cancel" } | null {
  const m = /^jv:a:(\d+):([a-f0-9]{8,64}):(ok|ed|no)$/.exec(data);
  if (!m) return null;
  return { id: Number(m[1]), hash: m[2]!, decision: m[3] === "ok" ? "approve" : m[3] === "ed" ? "edit" : "cancel" };
}

export function renderApproval(a: ApprovalRow, tz: string): { text: string; replyMarkup: Record<string, unknown> } {
  const label = ACTION_TYPES[a.action_type as ActionType] ?? a.action_type;
  const payloadText = typeof a.payload.text === "string" ? a.payload.text : JSON.stringify(a.payload, null, 2);
  const text = [
    `TASDIQ KERAK #${a.id}`,
    "",
    `Harakat: ${label}`,
    `Oluvchi: ${a.recipient}`,
    `Vaqt: ${a.scheduled_for ? formatLocal(new Date(a.scheduled_for), tz) : "tasdiqlangandan keyin darhol"}`,
    `Xarajat: ${a.cost_estimate ?? "yo‘q"}`,
    `Qisqacha: ${a.summary}`,
    "",
    "Aynan yuboriladigan matn:",
    "———",
    payloadText,
    "———",
    `Versiya: ${a.payload_hash.slice(0, 8)}`,
  ].join("\n");
  return {
    text,
    replyMarkup: {
      inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: approvalCallback(a, "ok") },
        { text: "✏️ Tahrirlash", callback_data: approvalCallback(a, "ed") },
        { text: "❌ Bekor qilish", callback_data: approvalCallback(a, "no") },
      ]],
    },
  };
}

export interface ExecutionOutcome {
  status: "bajarildi" | "xato" | "noaniq";
  message: string;
}

export interface ExecDeps {
  db: Db;
  cfg: AppConfig;
  send?: (chatId: string, text: string) => Promise<{ messageId: string }>;
}

/** Runs an approved action. Each executor double-checks its own allowlist. */
export async function executeApproval(deps: ExecDeps, a: ApprovalRow): Promise<ExecutionOutcome> {
  const send = deps.send ?? ((c: string, t: string) => sendText(c, t));
  let outcome: ExecutionOutcome;
  if (a.action_type === "telegram_post") {
    const text = typeof a.payload.text === "string" ? a.payload.text : "";
    if (!deps.cfg.publishChatIds.includes(a.recipient)) {
      outcome = { status: "xato", message: `Oluvchi ruxsatli ro‘yxatda yo‘q (TELEGRAM_PUBLISH_CHAT_IDS): ${a.recipient}` };
    } else if (!text.trim()) {
      outcome = { status: "xato", message: "Post matni bo‘sh." };
    } else {
      try {
        const r = await send(a.recipient, text);
        outcome = { status: "bajarildi", message: `Yuborildi (message_id ${r.messageId}).` };
      } catch (err) {
        const uncertain = err instanceof TelegramSendError ? err.kind === "uncertain" : true;
        outcome = uncertain
          ? { status: "noaniq", message: "Yuborish holati noaniq (tarmoq xatosi). Qayta yuborishdan oldin kanalni tekshiring." }
          : { status: "xato", message: err instanceof Error ? err.message : String(err) };
      }
    }
  } else {
    outcome = { status: "xato", message: `“${ACTION_TYPES[a.action_type as ActionType] ?? a.action_type}” uchun integratsiya hali ulanmagan. Matn tayyor — qo‘lda yuborishingiz mumkin.` };
  }
  await finishApproval(deps.db, a.id, outcome.status, outcome.message);
  return outcome;
}

export interface RequestDeps extends ExecDeps {
  ownerChatId: string;
  supersedes?: number | null;
  sendPrompt?: (chatId: string, text: string, replyMarkup: Record<string, unknown>) => Promise<{ messageId: string }>;
}

export type RequestResult =
  | { mode: "awaiting_approval"; approval: ApprovalRow }
  | { mode: "executed_with_standing_grant"; approval: ApprovalRow; outcome: ExecutionOutcome };

export async function requestApproval(deps: RequestDeps, input: ApprovalInput): Promise<RequestResult> {
  if (!(input.action_type in ACTION_TYPES)) {
    throw new StoreError(`Noma’lum harakat turi: ${input.action_type}. Ruxsat etilgan: ${Object.keys(ACTION_TYPES).join(", ")}`);
  }
  if (deps.supersedes) await supersedeApproval(deps.db, deps.supersedes);
  const approval = await createApproval(deps.db, input);
  if (await hasStandingGrant(deps.db, input.action_type, input.recipient)) {
    // A standing permission covers this exact action type and recipient.
    const claimed = await decideApproval(deps.db, approval.id, approval.payload_hash, "approve");
    if (claimed.ok) {
      const outcome = await executeApproval(deps, claimed.approval);
      return { mode: "executed_with_standing_grant", approval: claimed.approval, outcome };
    }
  }
  const sendPrompt = deps.sendPrompt ?? ((c, t, m) => sendText(c, t, { replyMarkup: m }));
  const { text, replyMarkup } = renderApproval(approval, deps.cfg.timezone);
  const msg = await sendPrompt(deps.ownerChatId, text, replyMarkup);
  if (msg.messageId) await setApprovalMessageId(deps.db, approval.id, msg.messageId);
  return { mode: "awaiting_approval", approval };
}
