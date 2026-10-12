import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { saveProject } from "../lib/store.ts";

export default defineTool({
  description:
    "Create or update a project card (matched by slug/name). Only fill fields Muhammadjon stated; omitted fields keep their current value. Keep each project's style and business goal separate — never copy data between projects.",
  inputSchema: z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    status: z.enum(["faol", "pauza", "yakunlangan", "aniqlanmagan"]).optional(),
    goal: z.string().optional(),
    audience: z.string().optional(),
    offer: z.string().optional(),
    style_notes: z.string().optional(),
    kpis: z.string().optional(),
    owners: z.string().optional(),
    next_step: z.string().optional(),
    blockers: z.string().optional(),
    source: z.string().optional().describe("Where this information came from, with date"),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({ project: localize((await saveProject(db, input)) as unknown as Record<string, unknown>, tz) }));
  },
});
