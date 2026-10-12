import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

// The model id is configuration, never hardcoded: set MODEL_ID in the server
// environment (see .env.example). The API key is read from ANTHROPIC_API_KEY.
// Missing MODEL_ID fails fast instead of silently using a framework default.
const modelId = process.env.MODEL_ID?.trim();
if (!modelId) {
  throw new Error("MODEL_ID is not set. Add it to the server environment (see .env.example).");
}

const intFromEnv = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
};

export default defineAgent({
  model: anthropic(modelId),
  // Jarvis needs no shell, file sandbox or sub-agents: only the typed tools in
  // agent/tools/. This also removes the need for a sandbox provider on the host.
  defaultTools: false,
  // Set explicitly so eve does not need to look the model up in a remote catalog.
  modelContextWindowTokens: intFromEnv("MODEL_CONTEXT_WINDOW_TOKENS", 200_000),
  // Spend guard: when a session reaches these totals eve pauses and asks the
  // owner (Telegram buttons) whether to grant a fresh budget.
  limits: {
    maxInputTokensPerSession: intFromEnv("SESSION_MAX_INPUT_TOKENS", 3_000_000),
    maxOutputTokensPerSession: intFromEnv("SESSION_MAX_OUTPUT_TOKENS", 200_000),
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1_000,
  },
});
