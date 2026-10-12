import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { listProjects } from "../lib/store.ts";

export default defineTool({
  description: "List project cards. Status 'aniqlanmagan' means it was mentioned before but is not confirmed active.",
  inputSchema: z.object({ status: z.enum(["faol", "pauza", "yakunlangan", "aniqlanmagan"]).optional() }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({
      projects: (await listProjects(db, input.status)).map((p) => localize(p as unknown as Record<string, unknown>, tz)),
    }));
  },
});
