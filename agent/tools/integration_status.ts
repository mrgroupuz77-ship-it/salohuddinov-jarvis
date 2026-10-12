import { defineTool } from "eve/tools";
import { z } from "zod";

import { collectStatuses } from "../lib/integrations.ts";
import { ownerTool } from "../lib/tool-helpers.ts";

export default defineTool({
  description: "Real connection status of every integration (Telegram, model, database, scheduler, calendar, Instagram, STT/TTS, calls, video). Check before claiming anything is connected or done through an integration.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    return ownerTool(ctx, async ({ db, cfg }) => ({ integrations: await collectStatuses(cfg, db) }));
  },
});
