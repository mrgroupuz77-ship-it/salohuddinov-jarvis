// Hourly wake-up, 01:00–01:59 UTC (06:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(1);
