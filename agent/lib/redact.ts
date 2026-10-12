// Secret redaction for logs, error messages and anything that might reach the
// model or a report. Two layers:
//  1. exact values of secret-looking environment variables;
//  2. well-known token shapes (Telegram bot tokens, API keys, DB passwords).

type Env = Record<string, string | undefined>;

const SECRET_NAME = /(TOKEN|SECRET|KEY|PASSWORD|PASSWD|CREDENTIAL|DATABASE_URL|AUTH)/i;

const PATTERNS: Array<[RegExp, string]> = [
  [/bot\d{5,12}:[A-Za-z0-9_-]{20,}/g, "bot[TELEGRAM_TOKEN]"],
  [/\b\d{5,12}:[A-Za-z0-9_-]{30,}\b/g, "[TELEGRAM_TOKEN]"],
  [/sk-ant-[A-Za-z0-9_-]{10,}/g, "[ANTHROPIC_KEY]"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, "[API_KEY]"],
  [/\bAC[a-f0-9]{32}\b/g, "[TWILIO_SID]"],
  [/(postgres(?:ql)?:\/\/[^:/\s@]+:)[^@\s]+@/gi, "$1***@"],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[REDACTED]"],
  [/(x-api-key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, "$1[REDACTED]"],
];

export function collectSecretValues(env: Env = process.env): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8) continue;
    if (SECRET_NAME.test(name)) values.add(value);
  }
  // Longest first so overlapping values are fully masked.
  return [...values].sort((a, b) => b.length - a.length);
}

export function redact(input: unknown, secrets: string[] = collectSecretValues()): string {
  let text = typeof input === "string" ? input : safeStringify(input);
  for (const s of secrets) {
    if (text.includes(s)) text = text.split(s).join("[REDACTED]");
  }
  for (const [re, replacement] of PATTERNS) text = text.replace(re, replacement);
  return text;
}

/** True when text contains something that must never be stored in memory. */
export function looksLikeSecret(text: string, secrets: string[] = collectSecretValues()): boolean {
  if (secrets.some((s) => text.includes(s))) return true;
  if (PATTERNS.some(([re]) => new RegExp(re.source, re.flags.replace("g", "")).test(text))) return true;
  // Card-number-like digit runs and explicit password statements.
  if (/\b(?:\d[ -]?){13,19}\b/.test(text)) return true;
  if (/\b(parol|password|пароль)\s*[:=]\s*\S+/i.test(text)) return true;
  return false;
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

let installed = false;

/**
 * Wraps process stdout/stderr so that anything printed by this app *or the
 * framework* passes through `redact` first. Installed once per process.
 */
export function installProcessRedaction(): void {
  if (installed || typeof process === "undefined" || !process.stdout) return;
  // The Node test runner talks to its children over stdout with a binary protocol.
  if (process.env.NODE_TEST_CONTEXT) return;
  installed = true;
  const secrets = () => collectSecretValues();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream) as (...args: unknown[]) => boolean;
    (stream as unknown as { write: (...args: unknown[]) => boolean }).write = (chunk: unknown, ...rest: unknown[]) => {
      try {
        if (typeof chunk === "string") return original(redact(chunk, secrets()), ...rest);
        if (chunk instanceof Uint8Array && !chunk.includes(0)) {
          // Only rewrite chunks that are genuine UTF-8 text; binary passes through untouched.
          const text = decoder.decode(chunk);
          const safe = redact(text, secrets());
          return original(safe === text ? chunk : safe, ...rest);
        }
      } catch {
        // Not text, or redaction failed: never let redaction break output.
      }
      return original(chunk, ...rest);
    };
  }
}
