// Hourly wake-up, 19:00–19:59 UTC (00:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(19);
