// Speech-to-text for Telegram voice messages (queued voice notes, not live
// calls). One OpenAI-compatible adapter: POST {base}/audio/transcriptions.
// Audio is processed in memory and never stored.

import type { AppConfig } from "../config.ts";
import { readSecret, sttReady } from "../config.ts";
import { redact } from "../redact.ts";
import { callBotApi } from "../telegram-api.ts";
import type { FetchLike } from "../telegram-api.ts";

export interface VoiceRef {
  fileId: string;
  durationSec?: number;
  mimeType?: string;
  fileSize?: number;
}

export const MAX_VOICE_BYTES = 20 * 1024 * 1024; // Bot API getFile download limit

export class SttError extends Error {}

export function voiceFromRaw(raw: Record<string, unknown>): VoiceRef | null {
  const v = (raw.voice ?? raw.audio ?? raw.video_note) as Record<string, unknown> | undefined;
  if (!v || typeof v.file_id !== "string") return null;
  return {
    fileId: v.file_id,
    durationSec: typeof v.duration === "number" ? v.duration : undefined,
    mimeType: typeof v.mime_type === "string" ? v.mime_type : undefined,
    fileSize: typeof v.file_size === "number" ? v.file_size : undefined,
  };
}

export async function transcribe(voice: VoiceRef, cfg: AppConfig, fetchImpl: FetchLike = globalThis.fetch as FetchLike): Promise<string> {
  if (!sttReady(cfg)) throw new SttError("STT ulanmagan.");
  if (voice.durationSec && voice.durationSec > cfg.stt.maxSeconds) {
    throw new SttError(`Ovozli xabar juda uzun (${voice.durationSec} s). Chegara: ${cfg.stt.maxSeconds} s.`);
  }
  if (voice.fileSize && voice.fileSize > MAX_VOICE_BYTES) throw new SttError("Fayl 20 MB dan katta.");

  const fileInfo = await callBotApi("getFile", { file_id: voice.fileId }, { fetch: fetchImpl });
  const filePath = (fileInfo.result as { file_path?: string } | undefined)?.file_path;
  if (!filePath) throw new SttError("Telegram fayl manzilini bermadi.");
  const token = readSecret("TELEGRAM_BOT_TOKEN");
  const base = cfg.telegramApiBaseUrl;
  const audioRes = await fetchImpl(`${base}/file/bot${token}/${filePath}`);
  if (!audioRes.ok) throw new SttError(`Ovozli faylni yuklab bo‘lmadi (HTTP ${audioRes.status}).`);
  const audio = new Uint8Array(await audioRes.arrayBuffer());
  if (audio.byteLength > MAX_VOICE_BYTES) throw new SttError("Fayl 20 MB dan katta.");

  const form = new FormData();
  form.append("model", cfg.stt.model!);
  form.append("language", cfg.stt.language);
  form.append("file", new Blob([audio], { type: voice.mimeType ?? "audio/ogg" }), filePath.split("/").pop() ?? "voice.ogg");
  const res = await fetchImpl(`${cfg.stt.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${readSecret("STT_API_KEY")}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SttError(redact(`STT xatosi HTTP ${res.status}: ${body.slice(0, 200)}`));
  }
  const json = (await res.json()) as { text?: string };
  const text = json.text?.trim();
  if (!text) throw new SttError("STT bo‘sh matn qaytardi.");
  return text;
}
