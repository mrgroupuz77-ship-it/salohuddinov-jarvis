// Hourly wake-up, 07:00–07:59 UTC (12:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(7);
