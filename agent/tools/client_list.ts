import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { listClients } from "../lib/store.ts";

export default defineTool({
  description: "List client cards, optionally by stage. Use to find unanswered clients and next steps.",
  inputSchema: z.object({
    stage: z.enum(["yangi_murojaat", "saralash", "uchrashuv", "taklif", "kelishuv", "faol", "toxtatilgan", "yakunlangan", "yoqotilgan"]).optional(),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({
      clients: (await listClients(db, input.stage)).map((c) => localize(c as unknown as Record<string, unknown>, tz)),
    }));
  },
});
