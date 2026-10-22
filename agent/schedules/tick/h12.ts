// Hourly wake-up, 12:00–12:59 UTC (17:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(12);
