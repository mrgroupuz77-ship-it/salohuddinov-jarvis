// Single place that answers "what is actually connected?". Status is derived
// from real evidence (configuration presence + recorded events), never from
// what the prompt would like to be true.

import type { AppConfig } from "./config.ts";
import { sttReady } from "./config.ts";
import type { Db } from "./db.ts";
import { MODEL_KEY_NAMES, PROVIDER_LABEL } from "./model-config.ts";
import { integrationEvents, lastInboundAt, lastReportRuns } from "./store.ts";
import { formatLocal } from "./time.ts";

export type IntegrationState = "ulangan" | "sozlangan_sinalmagan" | "ulanmagan" | "xato" | "eskirgan" | "ochirilgan";

export interface IntegrationStatus {
  key: string;
  label: string;
  state: IntegrationState;
  detail: string;
  stage: string;
}

const STATE_LABEL: Record<IntegrationState, string> = {
  ulangan: "✅ ulangan",
  sozlangan_sinalmagan: "🟡 sozlangan, hali sinalmagan",
  ulanmagan: "⚪ ulanmagan",
  xato: "🔴 xato",
  eskirgan: "🟠 ma’lumot eskirgan",
  ochirilgan: "⏸ o‘chirilgan",
};

export function stateLabel(state: IntegrationState): string {
  return STATE_LABEL[state];
}

export async function collectStatuses(cfg: AppConfig, db: Db | null, now = new Date()): Promise<IntegrationStatus[]> {
  const events = db ? await integrationEvents(db).catch(() => ({})) as Awaited<ReturnType<typeof integrationEvents>> : {};
  const inbound = db ? await lastInboundAt(db).catch(() => null) : null;
  const runs = db ? await lastReportRuns(db, 1).catch(() => []) : [];
  const tz = cfg.timezone;

  const hook = events["webhook"];
  const hookNote = hook ? ` · webhook: ${hook.state} (${formatLocal(new Date(hook.checked_at), tz)}${hook.detail ? `, ${hook.detail}` : ""})` : "";
  const telegram: IntegrationStatus = {
    key: "telegram",
    label: "Telegram bot (matn)",
    stage: "1–2",
    ...(inbound
      ? { state: "ulangan" as const, detail: `oxirgi kiruvchi xabar: ${formatLocal(inbound, tz)}${hookNote}` }
      : cfg.telegramTokenPresent
        ? { state: hook?.state === "xato" ? ("xato" as const) : ("sozlangan_sinalmagan" as const), detail: `token bor; hali xabar kelmagan${hookNote}` }
        : { state: "ulanmagan" as const, detail: "TELEGRAM_BOT_TOKEN yo‘q" }),
  };

  const owner: IntegrationStatus = {
    key: "owner",
    label: "Ega tekshiruvi",
    stage: "1–2",
    ...(cfg.ownerUserId
      ? { state: "ulangan" as const, detail: "TELEGRAM_OWNER_USER_ID o‘rnatilgan; boshqalar bloklanadi" }
      : { state: "ulanmagan" as const, detail: cfg.ownerIdInvalid ? "TELEGRAM_OWNER_USER_ID noto‘g‘ri formatda" : "TELEGRAM_OWNER_USER_ID yo‘q — bot hech kimga ishlamaydi" }),
  };

  const modelEvent = events["model"];
  const model: IntegrationStatus = {
    key: "model",
    label: `Model — ${PROVIDER_LABEL[cfg.modelProvider]}${cfg.modelId ? ` (${cfg.modelId})` : ""}`,
    stage: "1–2",
    ...(!cfg.modelIdPresent || !cfg.modelKeyPresent
      ? { state: "ulanmagan" as const, detail: `MODEL_ID yoki ${MODEL_KEY_NAMES[cfg.modelProvider][0]} yo‘q` }
      : modelEvent?.state === "xato"
        ? { state: "xato" as const, detail: `oxirgi xato: ${formatLocal(new Date(modelEvent.checked_at), tz)} — ${modelEvent.detail ?? ""}` }
        : modelEvent?.state === "ulangan"
          ? { state: "ulangan" as const, detail: `oxirgi muvaffaqiyatli javob: ${formatLocal(new Date(modelEvent.checked_at), tz)}` }
          : { state: "sozlangan_sinalmagan" as const, detail: "kalit bor; hali javob olinmagan" }),
  };

  const database: IntegrationStatus = {
    key: "database",
    label: "Ma’lumotlar bazasi",
    stage: "1–2",
    ...(db
      ? { state: "ulangan" as const, detail: db.kind === "postgres" ? "PostgreSQL" : "PGlite (lokal fayl — production uchun PostgreSQL tavsiya)" }
      : { state: "xato" as const, detail: "DATABASE_URL yo‘q yoki ulanib bo‘lmadi" }),
  };

  const lastRun = runs[0];
  const tick = events["scheduler"];
  const tickNote = tick ? `oxirgi uyg‘onish: ${formatLocal(new Date(tick.checked_at), tz)}` : "hali uyg‘onmagan";
  const scheduler: IntegrationStatus = {
    key: "scheduler",
    label: "Jadval (hisobotlar)",
    stage: "1–2",
    ...(lastRun
      ? {
          state: (lastRun.status === "xato" || lastRun.status === "noaniq" ? "xato" : "ulangan") as IntegrationState,
          detail: `oxirgi hisobot: ${lastRun.dedupe_key} — ${lastRun.status} (${formatLocal(new Date(lastRun.updated_at), tz)}); ${tickNote}`,
        }
      : tick
        ? { state: "ulangan" as const, detail: `${tickNote}; hali hisobot yuborilmagan` }
        : { state: "sozlangan_sinalmagan" as const, detail: "soatiga bir marta uyg‘onadi (Vercel bepul tarifida — soat ichidagi istalgan daqiqada); hali uyg‘onmagan" }),
  };

  const stt: IntegrationStatus = {
    key: "stt",
    label: "Ovozli xabar → matn (STT)",
    stage: "5",
    ...(sttReady(cfg)
      ? events["stt"]?.state === "xato"
        ? { state: "xato" as const, detail: events["stt"]?.detail ?? "" }
        : events["stt"]?.state === "ulangan"
          ? { state: "ulangan" as const, detail: `oxirgi transkript: ${formatLocal(new Date(events["stt"].checked_at), tz)}` }
          : { state: "sozlangan_sinalmagan" as const, detail: `provayder: ${cfg.stt.provider}, model: ${cfg.stt.model}; o‘zbekcha sifati sinalmagan` }
      : { state: "ulanmagan" as const, detail: "STT_PROVIDER/STT_MODEL/STT_API_KEY yo‘q" }),
  };

  const publish: IntegrationStatus = {
    key: "telegram_publish",
    label: "Telegram kanalga post (tasdiq bilan)",
    stage: "1–2",
    ...(cfg.publishChatIds.length
      ? { state: "sozlangan_sinalmagan" as const, detail: `ruxsatli chatlar: ${cfg.publishChatIds.length} ta` }
      : { state: "ulanmagan" as const, detail: "TELEGRAM_PUBLISH_CHAT_IDS bo‘sh" }),
  };

  const fixed: IntegrationStatus[] = [
    { key: "tts", label: "Ovozli javob (TTS)", stage: "5", state: "ulanmagan", detail: "provayder tanlanmagan; o‘zbekcha talaffuz sinovi kerak" },
    { key: "calendar", label: "Google Calendar", stage: "3", state: "ulanmagan", detail: "OAuth adapteri hali yozilmagan; uchrashuvlar vazifa sifatida saqlanadi" },
    { key: "instagram", label: "Instagram (Meta API)", stage: "4", state: "ulanmagan", detail: "OAuth yo‘q; jonli statistika yo‘q — skrinshot/CSV tahlili mumkin" },
    { key: "notion", label: "Notion", stage: "3", state: "ulanmagan", detail: "adapter yo‘q; asosiy manba — ichki baza" },
    { key: "video", label: "Video render worker", stage: "5", state: "ulanmagan", detail: "worker yo‘q; faqat montaj rejasi va subtitr" },
    {
      key: "calls",
      label: "Telefon qo‘ng‘irog‘i",
      stage: "5",
      state: cfg.callsEnabled ? "xato" : "ochirilgan",
      detail: cfg.callsEnabled ? "CALLS_ENABLED=true, lekin telephony adapteri hali yo‘q" : "CALLS_ENABLED=false",
    },
    { key: "telegram_call", label: "Telegram ichidagi qo‘ng‘iroq", stage: "—", state: "ulanmagan", detail: "Bot API bilan mumkin emas (faqat foydalanuvchi hisobi)" },
  ];

  void now;
  return [telegram, owner, model, database, scheduler, publish, stt, ...fixed];
}

export function formatStatuses(list: IntegrationStatus[]): string {
  const lines = list.map((s) => `${stateLabel(s.state)} — ${s.label}\n   ${s.detail}`);
  return ["INTEGRATSIYALAR HOLATI", "", ...lines].join("\n");
}
