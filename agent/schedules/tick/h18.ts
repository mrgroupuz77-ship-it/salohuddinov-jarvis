// Hourly wake-up, 18:00–18:59 UTC (23:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(18);
