// Hourly wake-up, 16:00–16:59 UTC (21:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(16);
