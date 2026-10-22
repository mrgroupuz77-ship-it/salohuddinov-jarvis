// Hourly wake-up, 22:00–22:59 UTC (03:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(22);
