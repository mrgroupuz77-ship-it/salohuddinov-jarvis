// Local stand-ins for the Telegram Bot API and the Anthropic Messages API so
// the real eve server can be exercised end to end without network or keys.

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

export interface Recorded {
  path: string;
  body: Record<string, unknown>;
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
}

export async function startTelegramMock() {
  const calls: Recorded[] = [];
  let nextId = 1000;
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
    const method = (req.url ?? "").split("/").pop() ?? "";
    calls.push({ path: method, body });
    res.setHeader("content-type", "application/json");
    if (method === "sendMessage") {
      res.end(JSON.stringify({ ok: true, result: { message_id: nextId++, chat: { id: Number(body.chat_id), type: "private" }, date: 0, text: body.text } }));
    } else {
      res.end(JSON.stringify({ ok: true, result: true }));
    }
  });
  const port = await listen(server);
  return { port, calls, close: () => new Promise<void>((r) => server.close(() => r())), sent: () => calls.filter((c) => c.path === "sendMessage") };
}

type Script = (request: Record<string, unknown>) => { kind: "text"; text: string } | { kind: "tool"; name: string; input: Record<string, unknown> };

function sse(res: ServerResponse, events: Array<[string, unknown]>) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

export async function startAnthropicMock(script: Script) {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    requests.push(body);
    const step = script(body);
    const message = { id: `msg_${requests.length}`, type: "message", role: "assistant", model: String(body.model), content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } };
    const block = step.kind === "text" ? { type: "text", text: "" } : { type: "tool_use", id: `toolu_${requests.length}`, name: step.name, input: {} };
    const delta = step.kind === "text" ? { type: "text_delta", text: step.text } : { type: "input_json_delta", partial_json: JSON.stringify(step.input) };
    const stop = step.kind === "text" ? "end_turn" : "tool_use";
    if (body.stream) {
      sse(res, [
        ["message_start", { type: "message_start", message }],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: block }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } }],
        ["message_stop", { type: "message_stop" }],
      ]);
    } else {
      const content = step.kind === "text" ? [{ type: "text", text: step.text }] : [{ type: "tool_use", id: `toolu_${requests.length}`, name: step.name, input: step.input }];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ...message, content, stop_reason: stop, usage: { input_tokens: 100, output_tokens: 20 } }));
    }
  });
  const port = await listen(server);
  return { port, requests, close: () => new Promise<void>((r) => server.close(() => r())) };
}
