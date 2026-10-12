// Deterministic reports built only from the database. No model involved, so
// no number can be invented: missing data is printed as "ma’lumot yo‘q".

import type { Db } from "./db.ts";
import type { ReportKind } from "./store.ts";
import { listPendingApprovals, listTasks } from "./store.ts";
import type { TaskRow } from "./store.ts";
import {
  UZ_MONTHS,
  UZ_WEEKDAYS,
  dayRange,
  formatLocal,
  formatLocalDate,
  monthRange,
  weekRange,
  zonedParts,
} from "./time.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** Change between equal periods; null when the base is zero (no fake %). */
export function compareCounts(current: number, previous: number): string {
  const diff = current - previous;
  const sign = diff > 0 ? "+" : "";
  if (previous === 0) return `${current} (oldingi davr: 0 — foiz hisoblanmaydi)`;
  const pct = Math.round((diff / previous) * 100);
  return `${current} (oldingi davr: ${previous}, ${sign}${diff}, ${sign}${pct}%)`;
}

function taskLine(t: TaskRow, tz: string, now: Date, withCriteria = false): string {
  const bits: string[] = [];
  if (t.project_name) bits.push(t.project_name);
  bits.push(`mas’ul: ${t.owner ?? "belgilanmagan"}`);
  if (t.due_at) {
    const due = new Date(t.due_at);
    bits.push(due < now ? `KECHIKKAN (${formatLocal(due, tz)})` : `muddat: ${formatLocal(due, tz)}`);
  } else {
    bits.push("muddat: belgilanmagan");
  }
  if (withCriteria) bits.push(`natija: ${t.done_criteria ?? "belgilanmagan"}`);
  return `${t.title} — ${bits.join(" · ")} [#${t.id}]`;
}

function rankForToday(tasks: TaskRow[], now: Date, todayEnd: Date): TaskRow[] {
  const pr: Record<string, number> = { shoshilinch: 0, yuqori: 1, orta: 2, past: 3 };
  const bucket = (t: TaskRow) => {
    if (t.due_at && new Date(t.due_at) < now) return 0; // overdue
    if (t.due_at && new Date(t.due_at) < todayEnd) return 1; // due today
    return 2;
  };
  return [...tasks]
    .filter((t) => t.status !== "tosiq_bor" && t.status !== "tasdiq_kutilmoqda")
    .sort((a, b) => bucket(a) - bucket(b) || pr[a.priority]! - pr[b.priority]! || a.id - b.id);
}

async function completedBetween(db: Db, start: Date, end: Date): Promise<Array<TaskRow & { event_at: Date }>> {
  const { rows } = await db.query<TaskRow & { event_at: Date }>(
    `SELECT DISTINCT ON (t.id) t.*, p.name AS project_name, e.created_at AS event_at
       FROM task_events e JOIN tasks t ON t.id = e.task_id LEFT JOIN projects p ON p.id = t.project_id
      WHERE e.to_status = 'tugallangan' AND e.created_at >= $1 AND e.created_at < $2 AND t.status = 'tugallangan'
      ORDER BY t.id, e.created_at DESC`,
    [start, end],
  );
  return rows;
}

async function count(db: Db, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.query<{ n: string | number }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

function decisionsBlock(pending: number, waitingTasks: TaskRow[]): string[] {
  const lines: string[] = [];
  if (pending) lines.push(`• ${pending} ta tasdiq kutilmoqda — /approvals`);
  for (const t of waitingTasks.slice(0, 3)) lines.push(`• Tasdiq kutayotgan vazifa: ${t.title} [#${t.id}]`);
  return lines.length ? ["", "SIZDAN KERAK:", ...lines] : [];
}

export interface ReportOptions {
  timezone: string;
  now?: Date;
}

export async function buildMorningBrief(db: Db, opts: ReportOptions): Promise<string> {
  const tz = opts.timezone;
  const now = opts.now ?? new Date();
  const p = zonedParts(now, tz);
  const { end } = dayRange(now, tz);
  const open = await listTasks(db, { open_only: true, limit: 200 });
  const top = rankForToday(open, now, end).slice(0, 3);
  const blocked = open.filter((t) => t.status === "tosiq_bor");
  const pending = (await listPendingApprovals(db)).filter((a) => a.status === "kutilmoqda").length;

  const lines = [`BUGUN — ${p.day}-${UZ_MONTHS[p.month - 1]}, ${UZ_WEEKDAYS[p.weekday]}`, ""];
  if (top.length) {
    lines.push("3 ta ustuvor ish:");
    top.forEach((t, i) => lines.push(`${i + 1}. ${taskLine(t, tz, now)}`));
  } else {
    lines.push("Ochiq vazifa yo‘q. Bugungi 3 ta asosiy ishni yozing — saqlab qo‘yaman.");
  }
  lines.push("", "Uchrashuvlar: kalendar ulanmagan — ko‘rsatilmadi.");
  if (blocked.length) {
    lines.push("", "To‘siqlar:");
    for (const t of blocked.slice(0, 5)) lines.push(`• ${t.title} — ${t.blocker ?? "sabab yozilmagan"} [#${t.id}]`);
  }
  if (pending) lines.push("", `Tasdiq kutilmoqda: ${pending} ta — /approvals`);
  return lines.join("\n");
}

export async function buildDailyReport(db: Db, opts: ReportOptions): Promise<string> {
  const tz = opts.timezone;
  const now = opts.now ?? new Date();
  const { start, end } = dayRange(now, tz);
  const done = await completedBetween(db, start, end);
  const created = await count(db, "SELECT count(*) AS n FROM tasks WHERE created_at >= $1 AND created_at < $2", [start, end]);
  const changed = await count(
    db,
    "SELECT count(DISTINCT task_id) AS n FROM task_events WHERE created_at >= $1 AND created_at < $2 AND from_status IS NOT NULL",
    [start, end],
  );
  const open = await listTasks(db, { open_only: true, limit: 200 });
  const blocked = open.filter((t) => t.status === "tosiq_bor");
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at) < now);
  const tomorrow = dayRange(new Date(end.getTime() + 60_000), tz);
  const next = rankForToday(open, now, tomorrow.end).slice(0, 3);
  const pending = (await listPendingApprovals(db)).filter((a) => a.status === "kutilmoqda").length;
  const waiting = open.filter((t) => t.status === "tasdiq_kutilmoqda");

  const lines = [`KUNLIK HISOBOT — ${formatLocalDate(now, tz)}`, "", "NIMA QILDIK?"];
  if (done.length) {
    for (const t of done.slice(0, 10)) lines.push(`• ${t.title}${t.project_name ? ` (${t.project_name})` : ""} — dalil: ${t.evidence ?? "—"}`);
  } else {
    lines.push("• Bugun tugallangan vazifa qayd etilmagan.");
  }

  lines.push("", "NIMA BO‘LDI?");
  lines.push(`• Yangi vazifa: ${created} · holati o‘zgargan: ${changed}`);
  lines.push(`• Kechikkan: ${overdue.length}${overdue.length ? ` — ${overdue.slice(0, 3).map((t) => `${t.title} [#${t.id}]`).join("; ")}` : ""}`);
  if (blocked.length) lines.push(`• To‘siq: ${blocked.slice(0, 3).map((t) => `${t.title} — ${t.blocker ?? "?"}`).join("; ")}`);
  lines.push("• Instagram ko‘rsatkichlari: ma’lumot yo‘q (API ulanmagan).");

  lines.push("", "ENDI NIMA QILAMIZ?");
  if (next.length) next.forEach((t, i) => lines.push(`${i + 1}. ${taskLine(t, tz, now, true)}`));
  else lines.push("• Ochiq vazifa yo‘q. Ertangi 3 ta ishni yozing.");
  lines.push(...decisionsBlock(pending, waiting));
  lines.push("", `Manba: Jarvis bazasi · davr: ${formatLocal(start, tz)} – ${formatLocal(end, tz)} (${tz})`);
  return lines.join("\n");
}

export async function buildWeeklyReport(db: Db, opts: ReportOptions): Promise<string> {
  const tz = opts.timezone;
  const now = opts.now ?? new Date();
  const week = weekRange(now, tz);
  const prev = weekRange(new Date(week.start.getTime() - 60_000), tz);
  const done = await completedBetween(db, week.start, week.end);
  const donePrev = await completedBetween(db, prev.start, prev.end);
  const createdNow = await count(db, "SELECT count(*) AS n FROM tasks WHERE created_at >= $1 AND created_at < $2", [week.start, week.end]);
  const createdPrev = await count(db, "SELECT count(*) AS n FROM tasks WHERE created_at >= $1 AND created_at < $2", [prev.start, prev.end]);
  const open = await listTasks(db, { open_only: true, limit: 200 });
  const nextWeek = weekRange(new Date(week.end.getTime() + 60_000), tz);
  const next = rankForToday(open, now, nextWeek.end).slice(0, 3);
  const { rows: projects } = await db.query<{ name: string; status: string; next_step: string | null }>(
    "SELECT name, status, next_step FROM projects WHERE status IN ('faol', 'pauza') ORDER BY status, name",
  );
  const { rows: stages } = await db.query<{ stage: string; n: string }>("SELECT stage, count(*) AS n FROM clients GROUP BY stage ORDER BY stage");
  const pending = (await listPendingApprovals(db)).filter((a) => a.status === "kutilmoqda").length;
  const waiting = open.filter((t) => t.status === "tasdiq_kutilmoqda");
  const endDisplay = new Date(week.end.getTime() - 60_000);

  const lines = [`HAFTALIK HISOBOT — ${formatLocalDate(week.start, tz)} – ${formatLocalDate(endDisplay, tz)}`, "", "NIMA QILDIK?"];
  if (done.length) {
    const byProject = new Map<string, string[]>();
    for (const t of done) {
      const key = t.project_name ?? "Loyihasiz";
      byProject.set(key, [...(byProject.get(key) ?? []), t.title]);
    }
    for (const [proj, titles] of byProject) lines.push(`• ${proj}: ${titles.slice(0, 5).join("; ")}${titles.length > 5 ? ` (+${titles.length - 5})` : ""}`);
  } else {
    lines.push("• Bu hafta tugallangan vazifa qayd etilmagan.");
  }

  lines.push("", "NIMA BO‘LDI? (teng davr: shu hafta va o‘tgan hafta)");
  lines.push(`• Tugallangan vazifalar: ${compareCounts(done.length, donePrev.length)}`);
  lines.push(`• Yangi vazifalar: ${compareCounts(createdNow, createdPrev)}`);
  lines.push(`• Loyihalar (faol/pauza): ${projects.length ? projects.map((p) => `${p.name} — ${p.status}${p.next_step ? `, keyingi: ${p.next_step}` : ""}`).join("; ") : "faol deb belgilangan loyiha yo‘q"}`);
  lines.push(`• Mijozlar bosqichi: ${stages.length ? stages.map((s) => `${s.stage}: ${s.n}`).join(", ") : "ma’lumot yo‘q"}`);
  lines.push("• Kontent natijasi: ma’lumot yo‘q (Instagram ulanmagan).");

  lines.push("", "ENDI NIMA QILAMIZ?");
  if (next.length) next.forEach((t, i) => lines.push(`${i + 1}. ${taskLine(t, tz, now, true)}`));
  else lines.push("• Keyingi hafta uchun vazifa yo‘q.");
  lines.push(...decisionsBlock(pending, waiting));
  lines.push("", "Tavsiya (davom ettirish / yaxshilash / to‘xtatish / yangi sinov) uchun “haftalik tavsiya” deb yozing.");
  lines.push(`Manba: Jarvis bazasi (${tz})`);
  return lines.join("\n");
}

export async function buildMonthlyReport(db: Db, opts: ReportOptions): Promise<string> {
  const tz = opts.timezone;
  const now = opts.now ?? new Date();
  const month = monthRange(now, tz, -1);
  const done = await completedBetween(db, month.start, month.end);
  const newClients = await count(db, "SELECT count(*) AS n FROM clients WHERE created_at >= $1 AND created_at < $2", [month.start, month.end]);
  const { rows: lost } = await db.query<{ name: string; lost_reason: string | null }>(
    "SELECT name, lost_reason FROM clients WHERE stage = 'yoqotilgan' AND updated_at >= $1 AND updated_at < $2",
    [month.start, month.end],
  );
  const open = await listTasks(db, { open_only: true, limit: 200 });
  const next = rankForToday(open, now, monthRange(now, tz, 0).end).slice(0, 3);
  const pending = (await listPendingApprovals(db)).filter((a) => a.status === "kutilmoqda").length;
  const waiting = open.filter((t) => t.status === "tasdiq_kutilmoqda");

  const lines = [`OYLIK HISOBOT — ${UZ_MONTHS[month.month - 1]} ${month.year}`, "", "NIMA QILDIK?"];
  if (done.length) {
    const byProject = new Map<string, number>();
    for (const t of done) byProject.set(t.project_name ?? "Loyihasiz", (byProject.get(t.project_name ?? "Loyihasiz") ?? 0) + 1);
    for (const [proj, n] of byProject) lines.push(`• ${proj}: ${n} ta vazifa tugallandi`);
  } else {
    lines.push("• Bu oyda tugallangan vazifa qayd etilmagan.");
  }
  lines.push("", "NIMA BO‘LDI?");
  lines.push(`• Yangi mijoz yozuvlari: ${newClients}`);
  if (lost.length) lines.push(`• Yo‘qotilgan kelishuvlar: ${lost.map((l) => `${l.name} — ${l.lost_reason ?? "sabab yo‘q"}`).join("; ")}`);
  lines.push("• Daromad / xarajat: ma’lumot yo‘q (manba ulanmagan).");
  lines.push("• Kontent natijasi: ma’lumot yo‘q (Instagram ulanmagan).");
  lines.push("", "ENDI NIMA QILAMIZ?");
  if (next.length) next.forEach((t, i) => lines.push(`${i + 1}. ${taskLine(t, tz, now, true)}`));
  else lines.push("• Ochiq vazifa yo‘q.");
  lines.push(...decisionsBlock(pending, waiting));
  const s = zonedParts(month.start, tz);
  lines.push("", `Manba: Jarvis bazasi · davr: ${pad(s.day)}.${pad(s.month)}.${s.year} – oy oxiri (${tz})`);
  return lines.join("\n");
}

export async function buildReport(db: Db, kind: ReportKind, opts: ReportOptions): Promise<string> {
  switch (kind) {
    case "morning":
      return buildMorningBrief(db, opts);
    case "daily":
      return buildDailyReport(db, opts);
    case "weekly":
      return buildWeeklyReport(db, opts);
    case "monthly":
      return buildMonthlyReport(db, opts);
  }
}
