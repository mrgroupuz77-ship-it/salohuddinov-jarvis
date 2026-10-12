// Deterministic commands and menu buttons. They answer from the database
// directly — no model call, no cost, no room for invented data.

import type { AppConfig } from "./config.ts";
import type { Db } from "./db.ts";
import { collectStatuses, formatStatuses } from "./integrations.ts";
import { renderApproval } from "./approvals.ts";
import { buildMorningBrief, buildReport } from "./reports.ts";
import type { ReportKind, Settings } from "./store.ts";
import { getSettings, grantStanding, listClients, listPendingApprovals, listProjects, revokeStanding, updateSettings } from "./store.ts";
import { ACTION_TYPES } from "./approvals.ts";
import { formatLocal } from "./time.ts";

export interface Reply {
  text: string;
  replyMarkup?: Record<string, unknown>;
}

export type CommandOutcome =
  | { kind: "reply"; replies: Reply[] }
  | { kind: "agent"; contextNote: string }
  | null;

export const MENU_KEYBOARD = {
  keyboard: [
    [{ text: "Bugun" }, { text: "Loyihalar" }],
    [{ text: "Mijozlar" }, { text: "Kontent" }],
    [{ text: "Tahlil" }, { text: "Hisobot" }],
    [{ text: "Tasdiqlar" }, { text: "Sozlamalar" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const MENU_TO_COMMAND: Record<string, string> = {
  bugun: "/today",
  loyihalar: "/projects",
  mijozlar: "/clients",
  kontent: "/content",
  tahlil: "/analyze",
  hisobot: "/report",
  tasdiqlar: "/approvals",
  sozlamalar: "/settings",
};

const REPORT_ALIASES: Record<string, ReportKind> = {
  ertalabki: "morning", morning: "morning", bugun: "morning",
  kunlik: "daily", daily: "daily",
  haftalik: "weekly", weekly: "weekly",
  oylik: "monthly", monthly: "monthly",
};

export const REPORT_LABEL: Record<ReportKind, string> = {
  morning: "ertalabki reja",
  daily: "kunlik hisobot",
  weekly: "haftalik hisobot",
  monthly: "oylik hisobot",
};

const WEEKDAY_UZ = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

/** Normalizes "/today@my_bot args" or a menu label to a command + args. */
export function parseCommand(text: string): { command: string; args: string[] } | null {
  const trimmed = text.trim();
  const menu = MENU_TO_COMMAND[trimmed.toLowerCase()];
  if (menu) return { command: menu, args: [] };
  const m = /^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/is.exec(trimmed);
  if (!m) return null;
  return { command: `/${m[1]!.toLowerCase()}`, args: (m[2] ?? "").split(/\s+/).filter(Boolean) };
}

export function reportKeyboard() {
  return {
    inline_keyboard: [[
      { text: "Bugun", callback_data: "jv:r:morning" },
      { text: "Kunlik", callback_data: "jv:r:daily" },
      { text: "Haftalik", callback_data: "jv:r:weekly" },
      { text: "Oylik", callback_data: "jv:r:monthly" },
    ]],
  };
}

function settingsText(s: Settings): string {
  const r = s.reports;
  const onOff = (b: boolean) => (b ? "yoqilgan" : "o‘chirilgan");
  return [
    "SOZLAMALAR",
    "",
    `Vaqt zonasi: ${s.timezone}`,
    `Proaktiv ishlar: ${s.paused ? `PAUZADA${s.paused_exceptions.length ? ` (istisno: ${s.paused_exceptions.map((k) => REPORT_LABEL[k]).join(", ")})` : ""}` : "yoqilgan"}`,
    `• Ertalabki reja: ${r.morning.time} — ${onOff(r.morning.enabled)}`,
    `• Kunlik hisobot: ${r.daily.time} — ${onOff(r.daily.enabled)}`,
    `• Haftalik: ${WEEKDAY_UZ[r.weekly.weekday ?? 0]} ${r.weekly.time} — ${onOff(r.weekly.enabled)}`,
    `• Oylik: har oyning ${r.monthly.day ?? 1}-kuni ${r.monthly.time} — ${onOff(r.monthly.enabled)}`,
    `Tinch vaqt: ${s.quiet_hours.start}–${s.quiet_hours.end}`,
    `Eslatmalar: ${s.reminder_minutes.join(" va ")} daqiqa oldin`,
    `Ovozli javob: ${onOff(s.voice_replies)}`,
    "",
    "O‘zgartirish uchun oddiy yozing, masalan: “kunlik hisobotni 22:00 ga o‘tkaz” yoki “vaqt zonasini Europe/Istanbul qil”.",
  ].join("\n");
}

export interface CommandDeps {
  db: Db;
  cfg: AppConfig;
  now?: Date;
}

export async function runCommand(text: string, deps: CommandDeps): Promise<CommandOutcome> {
  const parsed = parseCommand(text);
  if (!parsed) return null;
  const { db, cfg } = deps;
  const now = deps.now ?? new Date();
  const settings = await getSettings(db, cfg.timezone);
  const tz = settings.timezone;
  const reply = (...replies: Reply[]): CommandOutcome => ({ kind: "reply", replies });

  switch (parsed.command) {
    case "/start": {
      const statuses = await collectStatuses(cfg, db, now);
      const notConnected = statuses.filter((s) => s.state === "ulanmagan").map((s) => s.label);
      return reply({
        text: [
          "Labbay, bro. Jarvis tayyor.",
          "",
          `Vaqt zonasi: ${tz} (hozir ${formatLocal(now, tz)}). O‘zgartirish: “vaqt zonasini … qil”.`,
          `Hisobotlar: ertalab ${settings.reports.morning.time}, kechqurun ${settings.reports.daily.time}, yakshanba ${settings.reports.weekly.time}, oyning 1-kuni ${settings.reports.monthly.time}.`,
          "",
          "Oddiy o‘zbekcha yozavering — buyruq yodlash shart emas. Pastdagi menyu ham bor.",
          notConnected.length ? `\nHali ulanmagan: ${notConnected.join(", ")}. To‘liq holat: /status` : "",
          "",
          "Boshlash uchun: hozir faol loyihalaringizni bitta ro‘yxat qilib yozing (masalan: “faol: kosimov_study, bozorbuva”).",
        ].filter((l) => l !== "").join("\n"),
        replyMarkup: MENU_KEYBOARD,
      });
    }
    case "/help":
      return reply({
        text: [
          "Buyruqlar (yoki menyu tugmalari):",
          "/today — bugungi reja",
          "/projects — loyihalar",
          "/clients — mijozlar",
          "/content — kontent tayyorlash",
          "/report — hisobot (davr tanlab)",
          "/approvals — kutilayotgan tasdiqlar",
          "/status — integratsiyalar holati",
          "/settings — sozlamalar",
          "/pause va /resume — proaktiv xabarlarni to‘xtatish/yoqish",
        ].join("\n"),
        replyMarkup: MENU_KEYBOARD,
      });
    case "/today":
      return reply({ text: await buildMorningBrief(db, { timezone: tz, now }) });
    case "/projects": {
      const projects = await listProjects(db);
      if (!projects.length) return reply({ text: "Loyiha yo‘q. Yozing: “yangi loyiha: …”." });
      const by = (st: string) => projects.filter((p) => p.status === st);
      const fmt = (p: (typeof projects)[number]) => `• ${p.name}${p.next_step ? ` — keyingi: ${p.next_step}` : ""}`;
      const lines = ["LOYIHALAR"];
      for (const [st, label] of [["faol", "Faol"], ["pauza", "Pauza"], ["aniqlanmagan", "Holati aniqlanmagan"], ["yakunlangan", "Yakunlangan"]] as const) {
        const items = by(st);
        if (items.length) lines.push("", `${label}:`, ...items.map(fmt));
      }
      if (by("aniqlanmagan").length) lines.push("", "Qaysilari hozir faol? Bitta xabarda yozing — yangilab qo‘yaman.");
      return reply({ text: lines.join("\n") });
    }
    case "/clients": {
      const clients = await listClients(db);
      if (!clients.length) return reply({ text: "Mijoz yozuvi yo‘q. Yozing, masalan: “yangi mijoz: X klinika, Instagram orqali, SMM tizimi kerak”." });
      const lines = ["MIJOZLAR (oxirgi yangilanganlar)", ""];
      for (const c of clients.slice(0, 20)) {
        lines.push(`• ${c.name} — ${c.stage}${c.next_step ? ` · keyingi: ${c.next_step}` : ""}${c.due_at ? ` · muddat: ${formatLocal(new Date(c.due_at), tz)}` : ""} [#${c.id}]`);
      }
      return reply({ text: lines.join("\n") });
    }
    case "/content":
      return {
        kind: "agent",
        contextNote: "Muhammadjon “Kontent” bo‘limini ochdi. kontent-yozish skill’ini yukla. Agar loyiha, auditoriya yoki format aniq bo‘lmasa — bitta qisqa savol ber (masalan: qaysi loyiha va qaysi format: Reels ssenariy, Stories, post yoki 30 kunlik reja?).",
      };
    case "/analyze":
      return reply({
        text: [
          "Instagram API hali ulanmagan — jonli statistika yo‘q.",
          "Hozir qila olaman: Insights skrinshotlari yoki eksport CSV faylini yuboring, shu asosda tahlil qilaman (davri va manbasi bilan).",
          "Bu jonli monitoring emas.",
        ].join("\n"),
      });
    case "/report": {
      const kind = parsed.args[0] ? REPORT_ALIASES[parsed.args[0].toLowerCase()] : undefined;
      if (kind) return reply({ text: await buildReport(db, kind, { timezone: tz, now }) });
      return reply({ text: "Qaysi davr bo‘yicha hisobot?", replyMarkup: reportKeyboard() });
    }
    case "/approvals": {
      const pending = await listPendingApprovals(db);
      if (!pending.length) return reply({ text: "Kutilayotgan tasdiq yo‘q." });
      const replies: Reply[] = [];
      for (const a of pending.slice(0, 5)) {
        if (a.status === "kutilmoqda") {
          const r = renderApproval(a, tz);
          replies.push({ text: r.text, replyMarkup: r.replyMarkup });
        } else {
          replies.push({ text: `#${a.id} — ${a.summary}\nHolat: ${a.status}${a.result ? `\n${a.result}` : ""}` });
        }
      }
      return { kind: "reply", replies };
    }
    case "/status":
      return reply({ text: formatStatuses(await collectStatuses(cfg, db, now)) });
    case "/settings":
      return reply({ text: settingsText(settings) });
    case "/pause": {
      await updateSettings(db, { paused: true, paused_exceptions: [] }, cfg.timezone);
      return reply({ text: "Pauza. Rejalashtirilgan hisobot va eslatmalar to‘xtadi.\nHammasini yoqish: /resume\nFaqat bittasini: /resume kunlik (ertalabki, kunlik, haftalik, oylik)" });
    }
    case "/resume": {
      const kind = parsed.args[0] ? REPORT_ALIASES[parsed.args[0].toLowerCase()] : undefined;
      if (parsed.args[0] && !kind) return reply({ text: "Qaysi biri? ertalabki, kunlik, haftalik yoki oylik." });
      if (kind && settings.paused) {
        const exceptions = [...new Set([...settings.paused_exceptions, kind])];
        await updateSettings(db, { paused_exceptions: exceptions }, cfg.timezone);
        return reply({ text: `Pauza davom etadi, lekin ${REPORT_LABEL[kind]} yoqildi.` });
      }
      await updateSettings(db, { paused: false, paused_exceptions: [] }, cfg.timezone);
      return reply({ text: "Proaktiv ishlar yana yoqildi." });
    }
    case "/allow":
    case "/revoke": {
      // Standing permissions are set only by the owner's explicit command —
      // never by the model — so new knowledge cannot widen the agent's authority.
      const [action, recipient] = parsed.args;
      if (!action || !recipient || !(action in ACTION_TYPES)) {
        return reply({
          text: `Format: ${parsed.command} <harakat> <oluvchi>\nHarakatlar: ${Object.keys(ACTION_TYPES).join(", ")}\nMasalan: /allow telegram_post @kanalim`,
        });
      }
      if (parsed.command === "/allow") {
        await grantStanding(db, action, recipient, `owner command ${formatLocal(now, tz)}`);
        return reply({ text: `Doimiy ruxsat berildi: ${ACTION_TYPES[action as keyof typeof ACTION_TYPES]} → ${recipient}. Endi bu oluvchiga shu turdagi harakat qayta tasdiqsiz bajariladi. Bekor qilish: /revoke ${action} ${recipient}` });
      }
      const n = await revokeStanding(db, action, recipient);
      return reply({ text: n ? `Ruxsat bekor qilindi: ${action} → ${recipient}.` : "Bunday faol ruxsat topilmadi." });
    }
    default:
      return null; // Unknown command: let the agent handle it as text.
  }
}
