// Hourly wake-up, 21:00–21:59 UTC (02:00 Toshkent). See agent/lib/tick.ts.
import { hourlyTick } from "../../lib/tick.ts";

export default hourlyTick(21);
