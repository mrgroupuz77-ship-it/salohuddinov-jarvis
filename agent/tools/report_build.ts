import { defineTool } from "eve/tools";
import { z } from "zod";

import { buildReport } from "../lib/reports.ts";
import { getSettings } from "../lib/store.ts";
import { ownerTool } from "../lib/tool-helpers.ts";

export default defineTool({
  description:
    "Build a report from the database (morning = today's plan, daily, weekly, monthly = previous calendar month) in the 'NIMA QILDIK? / NIMA BO‘LDI? / ENDI NIMA QILAMIZ?' format. Send the returned text as-is; never add numbers that are not in it.",
  inputSchema: z.object({ kind: z.enum(["morning", "daily", "weekly", "monthly"]) }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, cfg }) => {
      const s = await getSettings(db, cfg.timezone);
      return { report: await buildReport(db, input.kind, { timezone: s.timezone }) };
    });
  },
});
