// Hourly wake-up, 02:00–02:59 UTC (07:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(2);
