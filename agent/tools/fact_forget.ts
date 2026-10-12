import { defineTool } from "eve/tools";
import { z } from "zod";

import { ownerTool } from "../lib/tool-helpers.ts";
import { forgetFact } from "../lib/store.ts";

export default defineTool({
  description: "Delete a remembered fact when Muhammadjon says 'unut' / 'buni unut' about it. Find the id with fact_list first; if unclear which one, ask.",
  inputSchema: z.object({ id: z.number().int() }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db }) => ({ deleted: await forgetFact(db, input.id) }));
  },
});
