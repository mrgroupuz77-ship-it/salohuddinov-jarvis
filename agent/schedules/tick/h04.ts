// Hourly wake-up, 04:00–04:59 UTC (09:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(4);
