// Phone-call guard (stage 5). The telephony provider is not wired yet, so
// `placeCall` can never report success. The guard rules are enforced already.

import type { AppConfig } from "../config.ts";
import type { Settings } from "../store.ts";
import { parseHm, zonedParts } from "../time.ts";
import { NotConnectedError } from "./not-connected.ts";

export interface CallRequest {
  to: string;
  reason: string;
  /** Wake-up calls must be explicitly scheduled by the owner. */
  explicitlyScheduled: boolean;
}

export type CallCheck = { ok: true } | { ok: false; reason: string };

function inQuietHours(settings: Settings, now: Date): boolean {
  const s = parseHm(settings.quiet_hours.start);
  const e = parseHm(settings.quiet_hours.end);
  if (!s || !e) return false;
  const p = zonedParts(now, settings.timezone);
  const cur = p.hour * 60 + p.minute;
  const start = s.hour * 60 + s.minute;
  const end = e.hour * 60 + e.minute;
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

export function checkCall(cfg: AppConfig, settings: Settings, req: CallRequest, now: Date, env = process.env): CallCheck {
  if (!cfg.callsEnabled) return { ok: false, reason: "Qo‘ng‘iroq o‘chirilgan (CALLS_ENABLED=false)." };
  const allowed = env.CALLS_ALLOWED_NUMBER?.trim();
  if (!allowed || req.to !== allowed) return { ok: false, reason: "Raqam tasdiqlangan ro‘yxatda yo‘q (CALLS_ALLOWED_NUMBER)." };
  if (inQuietHours(settings, now) && !req.explicitlyScheduled) {
    return { ok: false, reason: "Tinch vaqt. Faqat siz aniq belgilagan uyg‘otish qo‘ng‘irog‘i ruxsat etiladi." };
  }
  return { ok: true };
}

export async function placeCall(): Promise<never> {
  throw new NotConnectedError("Telefon qo‘ng‘irog‘i", "Telephony provayderi (masalan Twilio) hali ulanmagan — qo‘ng‘iroq qilinmadi.");
}
