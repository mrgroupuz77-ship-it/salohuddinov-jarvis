// Hourly wake-up, 17:00–17:59 UTC (22:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(17);
