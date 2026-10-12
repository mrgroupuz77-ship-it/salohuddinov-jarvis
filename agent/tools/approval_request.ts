import { defineTool } from "eve/tools";
import { z } from "zod";

import { ACTION_TYPES, requestApproval } from "../lib/approvals.ts";
import { getSettings, updateSettings } from "../lib/store.ts";
import { ownerTool } from "../lib/tool-helpers.ts";

const actionTypes = Object.keys(ACTION_TYPES) as [keyof typeof ACTION_TYPES, ...(keyof typeof ACTION_TYPES)[]];

export default defineTool({
  description:
    "The ONLY way to perform an external action (public post, message to a client, file to a third party, meeting invite, ad spend, payment, deletion, account change). Prepare everything first, then call this with the exact text, recipient, time and cost. The owner gets Tasdiqlash / Tahrirlash / Bekor qilish buttons; the server executes only after approval of this exact version. Never say it was sent — say it is waiting for approval.",
  inputSchema: z.object({
    action_type: z.enum(actionTypes),
    recipient: z.string().min(1).describe("Exact recipient: Telegram chat id/@channel for telegram_post, client name/contact otherwise"),
    summary: z.string().min(3).describe("One line: what and why"),
    text: z.string().min(1).describe("The exact content that will be sent"),
    scheduled_for: z.string().optional().describe("ISO 8601 with offset; omit for 'immediately after approval'"),
    cost_estimate: z.string().optional().describe("Money/credits this costs, if any"),
    supersedes_approval_id: z.number().int().optional().describe("When re-submitting an edited version"),
  }),
  async execute(input, ctx) {
    return ownerTool(ctx, async ({ db, cfg }) => {
      if (!cfg.ownerUserId) return { error: "TELEGRAM_OWNER_USER_ID sozlanmagan." };
      const result = await requestApproval(
        { db, cfg, ownerChatId: cfg.ownerUserId, supersedes: input.supersedes_approval_id ?? null },
        {
          action_type: input.action_type,
          recipient: input.recipient,
          summary: input.summary,
          payload: { text: input.text },
          scheduled_for: input.scheduled_for ?? null,
          cost_estimate: input.cost_estimate ?? null,
        },
      );
      const s = await getSettings(db, cfg.timezone);
      if (input.supersedes_approval_id && s.editing_approval_id === input.supersedes_approval_id) {
        await updateSettings(db, { editing_approval_id: null }, cfg.timezone);
      }
      if (result.mode === "executed_with_standing_grant") {
        return { status: result.outcome.status, note: "Oldindan berilgan doimiy ruxsat asosida bajarildi.", detail: result.outcome.message, approval_id: result.approval.id };
      }
      return { status: "tasdiq_kutilmoqda", approval_id: result.approval.id, note: "Tasdiq tugmalari Telegramga yuborildi. Hali hech narsa yuborilmadi." };
    });
  },
});
