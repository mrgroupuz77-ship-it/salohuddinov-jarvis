// Hourly wake-up, 20:00–20:59 UTC (01:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(20);
