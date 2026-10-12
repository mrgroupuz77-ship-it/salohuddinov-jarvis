import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { saveFact } from "../lib/store.ts";

export default defineTool({
  description:
    "Remember a durable fact, preference, writing-style rule or standing instruction Muhammadjon stated (kind: fakt | afzallik | uslub_qoidasi | ruxsat). Always give a source with date. A guess is 'taxmin', never 'tasdiqlangan'. Secrets (tokens, keys, passwords, card numbers) are rejected by the server. Saving a 'ruxsat' note does NOT grant permissions — real grants are set only by the owner's /allow command.",
  inputSchema: z.object({
    kind: z.enum(["fakt", "afzallik", "uslub_qoidasi", "ruxsat"]),
    subject: z.string().min(1).describe("Topic or project, e.g. 'shaxsiy', 'bozorbuva', 'hook uslubi'"),
    content: z.string().min(1),
    status: z.enum(["tasdiqlangan", "foydalanuvchi_bergan", "taxmin", "tekshirish_kerak"]),
    source: z.string().min(1).describe("e.g. 'Telegram, 2026-10-12, Muhammadjon tahriri'"),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({ fact: localize((await saveFact(db, input)) as unknown as Record<string, unknown>, tz) }));
  },
});
