import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { listFacts } from "../lib/store.ts";

export default defineTool({
  description: "Look up remembered facts, preferences, style rules and standing notes. Check before writing content or answering about Muhammadjon.",
  inputSchema: z.object({
    kind: z.enum(["fakt", "afzallik", "uslub_qoidasi", "ruxsat"]).optional(),
    subject: z.string().optional().describe("Substring to search in subject/content"),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({
      facts: (await listFacts(db, input)).map((f) => localize(f as unknown as Record<string, unknown>, tz)),
    }));
  },
});
