import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

// The eve HTTP API is an operator surface (dev TUI, health). It is NOT how
// Muhammadjon talks to Jarvis — that is Telegram. Tools additionally refuse
// every principal except the owner (see agent/lib/auth.ts).
const adminUser = process.env.EVE_ADMIN_USER?.trim();
const adminPassword = process.env.EVE_ADMIN_PASSWORD?.trim();

export default eveChannel({
  auth: [
    vercelOidc(),
    ...(adminUser && adminPassword ? [httpBasic({ username: adminUser, password: adminPassword }, { realm: "jarvis" })] : []),
    localDev(),
    placeholderAuth(),
  ],
});
