import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// Jarvis has no shell tools (defaultTools: false). eve still prepares one
// sandbox template at build time, so pin the inert in-process provider: a
// simulated shell with a virtual filesystem — no native processes, no host
// access, nothing that depends on Docker being installed on the server.
export const environment = JustBashSandbox.environment();
export default defineSandbox(() => environment.open());
