// Hourly wake-up, 15:00–15:59 UTC (20:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(15);
