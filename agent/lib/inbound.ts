// Telegram inbound pipeline, kept framework-agnostic so it can be tested
// without a running server. The eve channel (agent/channels/telegram.ts)
// is a thin wrapper around these two functions.

import type { AppConfig } from "./config.ts";
import { sttReady } from "./config.ts";
import type { Db } from "./db.ts";
import { log } from "./log.ts";
import { gate, ownerPrincipal } from "./auth.ts";
import type { InboundIdentity, PrincipalLike } from "./auth.ts";
import { runCommand, REPORT_LABEL } from "./commands.ts";
import type { Reply } from "./commands.ts";
import { executeApproval, parseApprovalCallback } from "./approvals.ts";
import { buildReport } from "./reports.ts";
import type { ReportKind } from "./store.ts";
import { allowNotification, claimOnce, decideApproval, getApproval, getSettings, recordIntegrationEvent, updateSettings } from "./store.ts";
import { UZ_WEEKDAYS, addLocalDays, dateKey, findAmbiguousTimes, formatLocal, zonedParts } from "./time.ts";
import { transcribe, voiceFromRaw } from "./adapters/stt.ts";
import type { VoiceRef } from "./adapters/stt.ts";

/** The subset of eve's Telegram handle this pipeline uses. */
export interface TelegramPort {
  post(message: string | { text: string; reply_markup?: Record<string, unknown> }): Promise<{ id?: string }>;
  startTyping(): Promise<void>;
  answerCallbackQuery(input: { callbackQueryId: string; text?: string; showAlert?: boolean }): Promise<unknown>;
  editMessageText(input: { messageId: number | string; text: string; replyMarkup?: Record<string, unknown> }): Promise<unknown>;
}

export interface InboundMessage extends InboundIdentity {
  text: string;
  caption: string;
  attachments: readonly unknown[];
  raw: Record<string, unknown>;
}

export interface InboundCallback {
  id: string;
  data?: string;
  from: { id: string; isBot: boolean };
  message?: { messageId: string; chat: { id: string } };
}

export interface PipelineDeps {
  cfg: AppConfig;
  db: () => Promise<Db>;
  now?: () => Date;
  transcribe?: (voice: VoiceRef, cfg: AppConfig) => Promise<string>;
}

export type InboundResult = { auth: PrincipalLike; context: string[] } | null;

const toPost = (r: Reply) => (r.replyMarkup ? { text: r.text, reply_markup: r.replyMarkup } : r.text);

export function buildTurnContext(opts: {
  now: Date;
  tz: string;
  paused: boolean;
  text: string;
  fromVoice: boolean;
  editingApproval?: { id: number; summary: string } | null;
  extra?: string;
}): string {
  const p = zonedParts(opts.now, opts.tz);
  const tomorrow = addLocalDays(opts.now, 1, opts.tz);
  const lines = [
    "<jarvis_context>",
    `Joriy vaqt: ${formatLocal(opts.now, opts.tz)} (${opts.tz}, ${UZ_WEEKDAYS[p.weekday]}). Bugun: ${dateKey(opts.now, opts.tz)}. Ertaga: ${dateKey(tomorrow, opts.tz)}.`,
    `Proaktiv hisobotlar: ${opts.paused ? "PAUZADA" : "yoqilgan"}.`,
  ];
  const ambiguous = findAmbiguousTimes(opts.text);
  if (ambiguous.length) {
    lines.push(`Diqqat: matndagi vaqt noaniq (${ambiguous.map((a) => `“${a}”`).join(", ")}) — 03:00 yoki 15:00 kabi farqni so‘ramasdan vaqt belgilama.`);
  }
  if (opts.fromVoice) {
    lines.push("Bu xabar ovozli xabardan avtomatik matnga o‘girilgan (STT). Ism, sana, vaqt, raqam va summalarni saqlash yoki ishlatishdan oldin Muhammadjonga qisqa tasdiqlat.");
  }
  if (opts.editingApproval) {
    lines.push(`Muhammadjon #${opts.editingApproval.id} tasdiqni tahrirlamoqda (“${opts.editingApproval.summary}”). Uning izohiga ko‘ra yangi versiyani approval_request bilan supersedes_approval_id=${opts.editingApproval.id} qilib yubor.`);
  }
  if (opts.extra) lines.push(opts.extra);
  lines.push("</jarvis_context>");
  return lines.join("\n");
}

export async function handleInboundMessage(tg: TelegramPort, message: InboundMessage, deps: PipelineDeps): Promise<InboundResult> {
  const { cfg } = deps;
  const verdict = gate(message, cfg);
  const now = deps.now?.() ?? new Date();

  if (verdict === "ignore" || verdict === "group") return null;
  if (verdict === "setup") {
    if (message.text.trim().startsWith("/start")) {
      await tg.post(
        `Bot hali sozlanmagan. Sizning Telegram ID raqamingiz: ${message.from!.id}\n` +
          "Agar siz bot egasi bo‘lsangiz, serverda TELEGRAM_OWNER_USER_ID shu raqamga teng qilib qo‘ying va serverni qayta ishga tushiring.",
      );
    }
    return null;
  }
  if (verdict === "stranger") {
    log.warn("message from non-owner dropped", { chat_type: message.chat.type });
    return null;
  }

  const db = await deps.db();
  // Idempotency: a Telegram retry of the same message never runs twice.
  if (!(await claimOnce(db, `msg:${message.chat.id}:${message.messageId}`))) {
    log.info("duplicate update ignored");
    return null;
  }

  const settings = await getSettings(db, cfg.timezone);
  let text = message.text || message.caption;
  let fromVoice = false;

  const voice = voiceFromRaw(message.raw);
  if (voice && !text.trim()) {
    if (!sttReady(cfg)) {
      await tg.post("Ovozli xabarni hozircha matnga o‘gira olmayman — STT ulanmagan (/status). Iltimos, matn bilan yozing.");
      return null;
    }
    try {
      await tg.startTyping();
      text = await (deps.transcribe ?? transcribe)(voice, cfg);
      fromVoice = true;
      await recordIntegrationEvent(db, "stt", "ulangan", "transkript olindi");
      // eve builds the model message from `message.text` after this hook returns.
      (message as { text: string }).text = text;
      await tg.post(`🎙 Eshitganim: “${text.length > 300 ? `${text.slice(0, 300)}…` : text}”`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await recordIntegrationEvent(db, "stt", "xato", msg.slice(0, 200));
      await tg.post(`Ovozli xabarni o‘gira olmadim: ${msg}\nMatn bilan yozib yuboring.`);
      return null;
    }
  }

  const command = fromVoice ? null : await runCommand(text, { db, cfg, now });
  if (command?.kind === "reply") {
    for (const r of command.replies) await tg.post(toPost(r));
    return null;
  }

  if (!cfg.modelIdPresent || !cfg.modelKeyPresent) {
    await tg.post("Claude modeli ulanmagan (MODEL_ID yoki ANTHROPIC_API_KEY yo‘q). Buyruqlar ishlaydi: /today, /projects, /report, /status.");
    return null;
  }
  if (!text.trim() && message.attachments.length === 0) return null;

  let editing: { id: number; summary: string } | null = null;
  if (settings.editing_approval_id) {
    const a = await getApproval(db, settings.editing_approval_id);
    if (a && a.status === "tahrirlanmoqda") editing = { id: a.id, summary: a.summary };
  }

  await tg.startTyping();
  return {
    auth: ownerPrincipal(message),
    context: [
      buildTurnContext({
        now,
        tz: settings.timezone,
        paused: settings.paused,
        text,
        fromVoice,
        editingApproval: editing,
        extra: command?.kind === "agent" ? command.contextNote : undefined,
      }),
    ],
  };
}

export async function handleCallback(tg: TelegramPort, query: InboundCallback, deps: PipelineDeps): Promise<void> {
  const { cfg } = deps;
  const now = deps.now?.() ?? new Date();
  if (!cfg.ownerUserId || query.from.id !== cfg.ownerUserId) {
    await tg.answerCallbackQuery({ callbackQueryId: query.id, text: "Ruxsat yo‘q." });
    return;
  }
  const db = await deps.db();
  if (!(await claimOnce(db, `cb:${query.id}`))) return;
  const data = query.data ?? "";
  const settings = await getSettings(db, cfg.timezone);

  const report = /^jv:r:(morning|daily|weekly|monthly)$/.exec(data);
  if (report) {
    const kind = report[1] as ReportKind;
    await tg.answerCallbackQuery({ callbackQueryId: query.id, text: REPORT_LABEL[kind] });
    await tg.post(await buildReport(db, kind, { timezone: settings.timezone, now }));
    return;
  }

  const parsed = parseApprovalCallback(data);
  if (!parsed) {
    await tg.answerCallbackQuery({ callbackQueryId: query.id, text: "Bu tugma eskirgan." });
    return;
  }
  const decided = await decideApproval(db, parsed.id, parsed.hash, parsed.decision);
  if (!decided.ok) {
    await tg.answerCallbackQuery({ callbackQueryId: query.id, text: decided.reason.slice(0, 190), showAlert: true });
    return;
  }
  const a = decided.approval;
  const messageId = query.message?.messageId;
  const editOriginal = async (suffix: string) => {
    if (!messageId) return;
    try {
      await tg.editMessageText({ messageId, text: `TASDIQ #${a.id} — ${a.summary}\n\n${suffix}`, replyMarkup: { inline_keyboard: [] } });
    } catch (err) {
      log.warn("approval message edit failed", { error: String(err) });
    }
  };

  if (parsed.decision === "cancel") {
    await tg.answerCallbackQuery({ callbackQueryId: query.id, text: "Bekor qilindi" });
    await editOriginal("❌ Bekor qilindi. Hech narsa yuborilmadi.");
    return;
  }
  if (parsed.decision === "edit") {
    await updateSettings(db, { editing_approval_id: a.id }, cfg.timezone);
    await tg.answerCallbackQuery({ callbackQueryId: query.id, text: "Tahrirlash" });
    await editOriginal("✏️ Tahrirlanmoqda. Bu versiya endi yuborilmaydi.");
    await tg.post("Nimani o‘zgartiramiz? Yozing — yangi versiyani tayyorlab, qayta tasdiqqa yuboraman.");
    return;
  }
  await tg.answerCallbackQuery({ callbackQueryId: query.id, text: "Bajarilmoqda…" });
  const outcome = await executeApproval({ db, cfg }, a);
  const icon = outcome.status === "bajarildi" ? "✅" : outcome.status === "noaniq" ? "⚠️" : "🔴";
  await editOriginal(`${icon} ${outcome.status === "bajarildi" ? "Tasdiqlandi va bajarildi" : outcome.status === "noaniq" ? "Holati noaniq" : "Bajarilmadi"}: ${outcome.message}`);
}

/** Owner-facing alert with per-key rate limiting (no repeated spam for one problem). */
export async function notifyOwnerOnce(db: Db, key: string, minIntervalMs: number, send: () => Promise<unknown>): Promise<boolean> {
  if (!(await allowNotification(db, key, minIntervalMs))) return false;
  await send();
  return true;
}
