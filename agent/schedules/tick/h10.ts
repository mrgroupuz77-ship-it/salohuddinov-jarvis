// Hourly wake-up, 10:00–10:59 UTC (15:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(10);
