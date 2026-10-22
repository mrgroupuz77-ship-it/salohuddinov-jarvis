// Hourly wake-up, 03:00–03:59 UTC (08:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(3);
