import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { defineAgent } from "eve";
import { anthropic } from "eve/models/anthropic";

import { resolveModelProvider } from "./lib/model-config.ts";

// The model id is configuration, never hardcoded: set MODEL_ID in the server
// environment (see .env.example). The provider follows from MODEL_ID or
// MODEL_PROVIDER (lib/model-config.ts):
//   gemini-…  → Google AI Studio key in GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)
//   claude-…  → ANTHROPIC_API_KEY
//   vendor/…  → Vercel AI Gateway
// Missing MODEL_ID fails fast instead of silently using a framework default.
const modelId = process.env.MODEL_ID?.trim();
if (!modelId) {
  throw new Error("MODEL_ID is not set. Add it to the server environment (see .env.example).");
}

const intFromEnv = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
};

function selectModel(id: string) {
  const provider = resolveModelProvider();
  if (provider === "gateway") return id;
  if (provider === "anthropic") return anthropic(id);
  const google = createGoogleGenerativeAI({
    // The SDK reads GOOGLE_GENERATIVE_AI_API_KEY at request time by itself;
    // GEMINI_API_KEY is accepted as a shorter alias.
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ? undefined : process.env.GEMINI_API_KEY?.trim() || undefined,
    // Only for local end-to-end tests against a mock server.
    baseURL: process.env.GOOGLE_GENERATIVE_AI_BASE_URL?.trim() || undefined,
  });
  return google(id);
}

export default defineAgent({
  model: selectModel(modelId),
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
