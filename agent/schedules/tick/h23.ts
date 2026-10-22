// Hourly wake-up, 23:00–23:59 UTC (04:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(23);
