import { defineSkill } from "eve/skills";

import contentRules from "../../context/content-rules.md?raw";

export default defineSkill({
  description:
    "Use whenever Muhammadjon asks for a Reels/video script, hook, Stories, post, caption, carousel, content plan, 6x5 ideas, 70/20/10 plan, or wants his own text edited in his voice.",
  markdown: contentRules,
});
