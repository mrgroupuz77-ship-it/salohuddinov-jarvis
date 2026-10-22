// Hourly wake-up, 06:00–06:59 UTC (11:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(6);
