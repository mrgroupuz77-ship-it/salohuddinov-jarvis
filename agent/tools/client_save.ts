import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { saveClient } from "../lib/store.ts";

export default defineTool({
  description:
    "Create a client card (omit id) or update one (with id). Stages: yangi_murojaat → saralash → uchrashuv → taklif → kelishuv → faol → toxtatilgan/yakunlangan; 'yoqotilgan' requires lost_reason. Never invent unknown fields.",
  inputSchema: z.object({
    id: z.number().int().optional(),
    name: z.string().optional().describe("Person or brand"),
    contact_source: z.string().optional(),
    service: z.string().optional(),
    need: z.string().optional(),
    stage: z.enum(["yangi_murojaat", "saralash", "uchrashuv", "taklif", "kelishuv", "faol", "toxtatilgan", "yakunlangan", "yoqotilgan"]).optional(),
    last_contact_at: z.string().optional(),
    next_step: z.string().optional(),
    due_at: z.string().optional(),
    owner: z.string().optional(),
    documents: z.string().optional(),
    lost_reason: z.string().optional(),
    project: z.string().optional(),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({ client: localize((await saveClient(db, input)) as unknown as Record<string, unknown>, tz) }));
  },
});
