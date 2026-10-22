// Hourly wake-up, 05:00–05:59 UTC (10:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(5);
