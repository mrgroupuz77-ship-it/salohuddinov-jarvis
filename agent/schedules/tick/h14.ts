// Hourly wake-up, 14:00–14:59 UTC (19:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(14);
