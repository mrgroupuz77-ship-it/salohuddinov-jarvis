import { defineInstructions } from "eve/instructions";

// Single source of truth lives in /context (human-editable markdown).
// These files are embedded at build time; they are short on purpose.
import whoIAm from "../../context/who-i-am.md?raw";
import howITalk from "../../context/how-i-talk.md?raw";
import howYouWork from "../../context/how-you-work.md?raw";

export default defineInstructions({
  content: [whoIAm, howITalk, howYouWork].join("\n\n---\n\n"),
});
