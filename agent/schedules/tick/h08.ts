// Hourly wake-up, 08:00–08:59 UTC (13:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(8);
