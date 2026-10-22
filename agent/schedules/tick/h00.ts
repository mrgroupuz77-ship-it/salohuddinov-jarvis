// Hourly wake-up, 00:00–00:59 UTC (05:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(0);
