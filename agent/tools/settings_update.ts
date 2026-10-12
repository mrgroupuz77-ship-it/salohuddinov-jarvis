import { defineTool } from "eve/tools";
import { z } from "zod";

import { ownerTool } from "../lib/tool-helpers.ts";
import { getSettings, updateSettings } from "../lib/store.ts";

const schedule = z.object({
  enabled: z.boolean().optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM, 24h, owner's time zone"),
  weekday: z.number().int().min(0).max(6).optional().describe("weekly only: 0 = yakshanba"),
  day: z.number().int().min(1).max(28).optional().describe("monthly only"),
});

export default defineTool({
  description:
    "Read (no fields) or change Muhammadjon's settings: time zone (IANA, e.g. Asia/Tashkent), report schedule (morning/daily/weekly/monthly), quiet hours, reminder minutes, voice replies, pause. Only change what he asked for.",
  inputSchema: z.object({
    timezone: z.string().optional(),
    paused: z.boolean().optional(),
    reports: z.object({ morning: schedule.optional(), daily: schedule.optional(), weekly: schedule.optional(), monthly: schedule.optional() }).optional(),
    quiet_hours: z.object({ start: z.string(), end: z.string() }).optional(),
    reminder_minutes: z.array(z.number().int().min(1).max(1440)).max(5).optional(),
    voice_replies: z.boolean().optional(),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, cfg }) => {
      const hasChange = Object.values(input).some((v) => v !== undefined);
      if (!hasChange) return { settings: await getSettings(db, cfg.timezone) };
      const patch = { ...input } as Parameters<typeof updateSettings>[1];
      if (input.paused === false) patch.paused_exceptions = [];
      return { settings: await updateSettings(db, patch, cfg.timezone) };
    });
  },
});
