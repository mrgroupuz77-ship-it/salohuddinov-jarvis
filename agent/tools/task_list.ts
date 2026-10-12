import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { listTasks } from "../lib/store.ts";

export default defineTool({
  description: "List tasks from the database. Defaults to open tasks. Always check this before answering about what is planned, overdue or done.",
  inputSchema: z.object({
    status: z.enum(["yangi", "rejalashtirilgan", "bajarilmoqda", "tekshiruvda", "tasdiq_kutilmoqda", "tugallangan", "tosiq_bor", "xato", "bekor_qilingan"]).optional(),
    project: z.string().optional(),
    open_only: z.boolean().optional(),
    due_before: z.string().optional().describe("ISO 8601"),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => {
      const tasks = await listTasks(db, input);
      return { count: tasks.length, tasks: tasks.map((t) => localize(t as unknown as Record<string, unknown>, tz)) };
    });
  },
});
