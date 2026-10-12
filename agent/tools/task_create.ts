import { defineTool } from "eve/tools";
import { z } from "zod";

import { localize, ownerTool, stableKey } from "../lib/tool-helpers.ts";
import { createTask } from "../lib/store.ts";

export default defineTool({
  description:
    "Save a new task for Muhammadjon. Use whenever a request implies work to track. Leave unknown fields empty — never guess owner, deadline or project. due_at must be ISO 8601 with offset (e.g. 2026-10-13T15:00:00+05:00); if the time is ambiguous (03:00 vs 15:00), ask first.",
  inputSchema: z.object({
    title: z.string().min(2).describe("Short concrete task title in Uzbek"),
    project: z.string().optional().describe("Project slug or name (must exist; see project_list)"),
    priority: z.enum(["past", "orta", "yuqori", "shoshilinch"]).optional(),
    owner: z.string().optional().describe("Responsible person, only if stated"),
    due_at: z.string().optional(),
    done_criteria: z.string().optional().describe("What counts as done, only if stated or obvious"),
    status: z.enum(["yangi", "rejalashtirilgan"]).optional(),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, tz, turnId }) => {
      const { task, created } = await createTask(db, { ...input, source_key: stableKey(turnId, input.title) });
      return { created, task: localize(task as unknown as Record<string, unknown>, tz) };
    });
  },
});
