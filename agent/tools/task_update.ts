import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool } from "../lib/tool-helpers.ts";
import { updateTask } from "../lib/store.ts";

export default defineTool({
  description:
    "Update a task's status or fields. Status 'tugallangan' REQUIRES evidence (file, link, API result or confirmed record) — the server rejects it otherwise. 'tosiq_bor' requires a blocker description.",
  inputSchema: z.object({
    id: z.number().int(),
    status: z.enum(["yangi", "rejalashtirilgan", "bajarilmoqda", "tekshiruvda", "tasdiq_kutilmoqda", "tugallangan", "tosiq_bor", "xato", "bekor_qilingan"]).optional(),
    evidence: z.string().optional(),
    blocker: z.string().optional(),
    title: z.string().optional(),
    priority: z.enum(["past", "orta", "yuqori", "shoshilinch"]).optional(),
    owner: z.string().optional(),
    due_at: z.string().optional(),
    done_criteria: z.string().optional(),
    note: z.string().optional().describe("Why the status changed"),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz }) => ({ task: localize((await updateTask(db, input)) as unknown as Record<string, unknown>, tz) }));
  },
});
