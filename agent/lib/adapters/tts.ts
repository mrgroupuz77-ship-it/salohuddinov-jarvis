// Text-to-speech contract (stage 5). No provider is selected yet: Uzbek
// pronunciation must be tested in practice before one is chosen.

import { NotConnectedError } from "./not-connected.ts";

export interface TtsAdapter {
  readonly name: string;
  synthesize(text: string, opts: { language: string; voice?: string }): Promise<{ audio: Uint8Array; mimeType: string }>;
}

export const tts: TtsAdapter = {
  name: "none",
  async synthesize() {
    throw new NotConnectedError("TTS", "Ovozli javob o‘chirilgan; matnli javob davom etadi.");
  },
};
