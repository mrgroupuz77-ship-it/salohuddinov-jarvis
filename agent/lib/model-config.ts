// Which model provider Jarvis talks to. Pure functions over the environment so
// the choice is testable and identical in agent.ts, /status and check-env.
//
//   google    — Gemini API (Google AI Studio key). Has a free tier.
//   anthropic — Claude API (pay-as-you-go).
//   gateway   — Vercel AI Gateway model id such as "anthropic/claude-haiku-5.5".
//
// MODEL_PROVIDER wins when set. Otherwise the MODEL_ID decides ("gemini-…" →
// google, "claude-…" → anthropic, "vendor/model" → gateway), so switching
// models never needs a code change.

type Env = Record<string, string | undefined>;

export type ModelProvider = "google" | "anthropic" | "gateway";

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function resolveModelProvider(env: Env = process.env): ModelProvider {
  const explicit = clean(env.MODEL_PROVIDER)?.toLowerCase();
  if (explicit === "google" || explicit === "gemini") return "google";
  if (explicit === "anthropic" || explicit === "claude") return "anthropic";
  if (explicit === "gateway" || explicit === "vercel") return "gateway";

  const id = clean(env.MODEL_ID) ?? "";
  if (id.includes("/")) return "gateway";
  if (/^claude/i.test(id)) return "anthropic";
  if (/^(gemini|gemma)/i.test(id)) return "google";

  // No hint in the id (e.g. a build placeholder): follow whichever key exists.
  if (clean(env.ANTHROPIC_API_KEY)) return "anthropic";
  return "google";
}

/** Environment variable names that can hold the credential for a provider. */
export const MODEL_KEY_NAMES: Record<ModelProvider, string[]> = {
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  // On Vercel the deployment authenticates to AI Gateway with OIDC.
  gateway: ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"],
};

export function modelKeyPresent(env: Env = process.env, provider = resolveModelProvider(env)): boolean {
  if (provider === "gateway" && clean(env.VERCEL) === "1") return true;
  return MODEL_KEY_NAMES[provider].some((name) => Boolean(clean(env[name])));
}

export const PROVIDER_LABEL: Record<ModelProvider, string> = {
  google: "Gemini (Google AI Studio)",
  anthropic: "Claude (Anthropic API)",
  gateway: "Vercel AI Gateway",
};

/**
 * Recognises "out of free quota / rate limited" failures from any provider so
 * the owner gets a plain explanation instead of a generic error.
 */
export function isQuotaError(text: string | undefined | null): boolean {
  if (!text) return false;
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests|insufficient.?(credits|funds|balance)/i.test(text);
}
