// Hourly wake-up, 13:00–13:59 UTC (18:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(13);
