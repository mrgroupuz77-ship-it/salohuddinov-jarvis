// Data access for tasks, projects, clients, facts, settings, approvals and
// idempotency keys. Business rules that must not depend on the prompt live
// here (e.g. "completed requires evidence", "no secrets in memory").

import { createHash } from "node:crypto";

import type { Db } from "./db.ts";
import {
  CLIENT_STAGES,
  FACT_KINDS,
  FACT_STATUSES,
  OPEN_TASK_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
} from "./migrations.ts";
import { looksLikeSecret } from "./redact.ts";
import { isValidTimezone } from "./config.ts";
import { parseHm } from "./time.ts";

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ClientStage = (typeof CLIENT_STAGES)[number];
export type FactKind = (typeof FACT_KINDS)[number];
export type FactStatus = (typeof FACT_STATUSES)[number];

export class StoreError extends Error {}

const oneOf = <T extends string>(values: readonly T[], value: unknown, field: string): T => {
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw new StoreError(`${field} noto‘g‘ri: "${String(value)}". Ruxsat etilgan: ${values.join(", ")}`);
};

const toDate = (value: unknown, field: string): Date | null => {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new StoreError(`${field} sana formati noto‘g‘ri: "${String(value)}"`);
  return d;
};

const nn = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// ───────────────────────── idempotency ─────────────────────────

/** Returns true the first time a key is seen, false for duplicates. */
export async function claimOnce(db: Db, key: string): Promise<boolean> {
  const { rows } = await db.query<{ key: string }>(
    "INSERT INTO processed_updates (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key",
    [key],
  );
  return rows.length === 1;
}

export async function lastInboundAt(db: Db): Promise<Date | null> {
  const { rows } = await db.query<{ t: Date | null }>(
    "SELECT max(received_at) AS t FROM processed_updates WHERE key LIKE 'msg:%'",
  );
  return rows[0]?.t ? new Date(rows[0].t) : null;
}

// ───────────────────────── projects ─────────────────────────

export interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  status: ProjectStatus;
  goal: string | null;
  audience: string | null;
  offer: string | null;
  style_notes: string | null;
  kpis: string | null;
  owners: string | null;
  next_step: string | null;
  blockers: string | null;
  source: string | null;
  updated_at: Date;
}

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[‘’'`ʻʼ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "loyiha";

export interface ProjectInput {
  name: string;
  slug?: string;
  status?: string;
  goal?: string;
  audience?: string;
  offer?: string;
  style_notes?: string;
  kpis?: string;
  owners?: string;
  next_step?: string;
  blockers?: string;
  source?: string;
}

export async function saveProject(db: Db, input: ProjectInput): Promise<ProjectRow> {
  const name = nn(input.name);
  if (!name) throw new StoreError("Loyiha nomi kerak.");
  const slug = slugify(input.slug ?? name);
  const status = input.status ? oneOf(PROJECT_STATUSES, input.status, "status") : null;
  const { rows } = await db.query<ProjectRow>(
    `INSERT INTO projects (slug, name, status, goal, audience, offer, style_notes, kpis, owners, next_step, blockers, source)
     VALUES ($1, $2, COALESCE($3, 'aniqlanmagan'), $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       status = COALESCE($3, projects.status),
       goal = COALESCE($4, projects.goal),
       audience = COALESCE($5, projects.audience),
       offer = COALESCE($6, projects.offer),
       style_notes = COALESCE($7, projects.style_notes),
       kpis = COALESCE($8, projects.kpis),
       owners = COALESCE($9, projects.owners),
       next_step = COALESCE($10, projects.next_step),
       blockers = COALESCE($11, projects.blockers),
       source = COALESCE($12, projects.source),
       updated_at = now()
     RETURNING *`,
    [
      slug, name, status, nn(input.goal), nn(input.audience), nn(input.offer), nn(input.style_notes),
      nn(input.kpis), nn(input.owners), nn(input.next_step), nn(input.blockers), nn(input.source),
    ],
  );
  return rows[0]!;
}

export async function listProjects(db: Db, status?: string): Promise<ProjectRow[]> {
  if (status) {
    const s = oneOf(PROJECT_STATUSES, status, "status");
    return (await db.query<ProjectRow>("SELECT * FROM projects WHERE status = $1 ORDER BY name", [s])).rows;
  }
  return (await db.query<ProjectRow>(
    "SELECT * FROM projects ORDER BY CASE status WHEN 'faol' THEN 0 WHEN 'aniqlanmagan' THEN 1 WHEN 'pauza' THEN 2 ELSE 3 END, name",
  )).rows;
}

export async function findProject(db: Db, ref: string | number | undefined | null): Promise<ProjectRow | null> {
  if (ref === undefined || ref === null || ref === "") return null;
  if (typeof ref === "number" || /^\d+$/.test(String(ref))) {
    const { rows } = await db.query<ProjectRow>("SELECT * FROM projects WHERE id = $1", [Number(ref)]);
    return rows[0] ?? null;
  }
  const { rows } = await db.query<ProjectRow>(
    "SELECT * FROM projects WHERE slug = $1 OR lower(name) = lower($2) LIMIT 1",
    [slugify(String(ref)), String(ref)],
  );
  return rows[0] ?? null;
}

// ───────────────────────── clients ─────────────────────────

export interface ClientRow {
  id: number;
  name: string;
  contact_source: string | null;
  service: string | null;
  need: string | null;
  stage: ClientStage;
  last_contact_at: Date | null;
  next_step: string | null;
  due_at: Date | null;
  owner: string | null;
  documents: string | null;
  lost_reason: string | null;
  project_id: number | null;
  updated_at: Date;
}

export interface ClientInput {
  id?: number;
  name?: string;
  contact_source?: string;
  service?: string;
  need?: string;
  stage?: string;
  last_contact_at?: string;
  next_step?: string;
  due_at?: string;
  owner?: string;
  documents?: string;
  lost_reason?: string;
  project?: string | number;
}

export async function saveClient(db: Db, input: ClientInput): Promise<ClientRow> {
  const stage = input.stage ? oneOf(CLIENT_STAGES, input.stage, "stage") : null;
  if (stage === "yoqotilgan" && !nn(input.lost_reason)) {
    throw new StoreError("Yo‘qotilgan kelishuv uchun sabab (lost_reason) kerak.");
  }
  const project = await findProject(db, input.project);
  if (input.project !== undefined && input.project !== "" && !project) {
    throw new StoreError(`Loyiha topilmadi: ${String(input.project)}`);
  }
  const values = [
    nn(input.contact_source), nn(input.service), nn(input.need), stage,
    toDate(input.last_contact_at, "last_contact_at"), nn(input.next_step), toDate(input.due_at, "due_at"),
    nn(input.owner), nn(input.documents), nn(input.lost_reason), project?.id ?? null,
  ];
  if (input.id) {
    const { rows } = await db.query<ClientRow>(
      `UPDATE clients SET
         name = COALESCE($2, name), contact_source = COALESCE($3, contact_source), service = COALESCE($4, service),
         need = COALESCE($5, need), stage = COALESCE($6, stage), last_contact_at = COALESCE($7, last_contact_at),
         next_step = COALESCE($8, next_step), due_at = COALESCE($9, due_at), owner = COALESCE($10, owner),
         documents = COALESCE($11, documents), lost_reason = COALESCE($12, lost_reason),
         project_id = COALESCE($13, project_id), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [input.id, nn(input.name), ...values],
    );
    if (!rows[0]) throw new StoreError(`Mijoz topilmadi: #${input.id}`);
    return rows[0];
  }
  const name = nn(input.name);
  if (!name) throw new StoreError("Mijoz nomi yoki brendi kerak.");
  const { rows } = await db.query<ClientRow>(
    `INSERT INTO clients (name, contact_source, service, need, stage, last_contact_at, next_step, due_at, owner, documents, lost_reason, project_id)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'yangi_murojaat'), $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [name, ...values],
  );
  return rows[0]!;
}

export async function listClients(db: Db, stage?: string): Promise<ClientRow[]> {
  if (stage) {
    const s = oneOf(CLIENT_STAGES, stage, "stage");
    return (await db.query<ClientRow>("SELECT * FROM clients WHERE stage = $1 ORDER BY updated_at DESC", [s])).rows;
  }
  return (await db.query<ClientRow>("SELECT * FROM clients ORDER BY updated_at DESC LIMIT 100")).rows;
}

// ───────────────────────── tasks ─────────────────────────

export interface TaskRow {
  id: number;
  title: string;
  status: TaskStatus;
  priority: Priority;
  owner: string | null;
  due_at: Date | null;
  done_criteria: string | null;
  evidence: string | null;
  blocker: string | null;
  project_id: number | null;
  client_id: number | null;
  project_name?: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface TaskInput {
  title: string;
  status?: string;
  priority?: string;
  owner?: string;
  due_at?: string;
  done_criteria?: string;
  project?: string | number;
  client_id?: number;
  source_key?: string;
}

const TASK_SELECT = `SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id`;

export async function createTask(db: Db, input: TaskInput): Promise<{ task: TaskRow; created: boolean }> {
  const title = nn(input.title);
  if (!title) throw new StoreError("Vazifa nomi kerak.");
  const status = input.status ? oneOf(TASK_STATUSES, input.status, "status") : "yangi";
  if (status === "tugallangan") throw new StoreError("Yangi vazifa darhol tugallangan bo‘lmaydi: avval yarating, keyin dalil bilan yoping.");
  const priority = input.priority ? oneOf(PRIORITIES, input.priority, "priority") : "orta";
  const project = await findProject(db, input.project);
  if (input.project !== undefined && input.project !== "" && !project) {
    throw new StoreError(`Loyiha topilmadi: ${String(input.project)}. Avval project_save bilan yarating.`);
  }
  const sourceKey = nn(input.source_key);
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO tasks (title, status, priority, owner, due_at, done_criteria, project_id, client_id, source_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (source_key) DO NOTHING RETURNING id`,
    [title, status, priority, nn(input.owner), toDate(input.due_at, "due_at"), nn(input.done_criteria),
      project?.id ?? null, input.client_id ?? null, sourceKey],
  );
  if (rows[0]) {
    await db.query("INSERT INTO task_events (task_id, from_status, to_status, note) VALUES ($1, NULL, $2, 'yaratildi')", [rows[0].id, status]);
    return { task: (await getTask(db, rows[0].id))!, created: true };
  }
  const existing = await db.query<TaskRow>(`${TASK_SELECT} WHERE t.source_key = $1`, [sourceKey]);
  return { task: existing.rows[0]!, created: false };
}

export async function getTask(db: Db, id: number): Promise<TaskRow | null> {
  const { rows } = await db.query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface TaskFilter {
  status?: string;
  open_only?: boolean;
  project?: string | number;
  due_before?: string;
  limit?: number;
}

export async function listTasks(db: Db, filter: TaskFilter = {}): Promise<TaskRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(oneOf(TASK_STATUSES, filter.status, "status"));
    where.push(`t.status = $${params.length}`);
  } else if (filter.open_only !== false) {
    params.push([...OPEN_TASK_STATUSES]);
    where.push(`t.status = ANY($${params.length})`);
  }
  if (filter.project !== undefined && filter.project !== "") {
    const p = await findProject(db, filter.project);
    if (!p) return [];
    params.push(p.id);
    where.push(`t.project_id = $${params.length}`);
  }
  const before = toDate(filter.due_before, "due_before");
  if (before) {
    params.push(before);
    where.push(`t.due_at < $${params.length}`);
  }
  params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200));
  const sql = `${TASK_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY CASE t.priority WHEN 'shoshilinch' THEN 0 WHEN 'yuqori' THEN 1 WHEN 'orta' THEN 2 ELSE 3 END,
             t.due_at NULLS LAST, t.id
    LIMIT $${params.length}`;
  return (await db.query<TaskRow>(sql, params)).rows;
}

export interface TaskUpdate {
  id: number;
  status?: string;
  evidence?: string;
  blocker?: string;
  title?: string;
  priority?: string;
  owner?: string;
  due_at?: string;
  done_criteria?: string;
  note?: string;
}

export async function updateTask(db: Db, update: TaskUpdate): Promise<TaskRow> {
  const current = await getTask(db, update.id);
  if (!current) throw new StoreError(`Vazifa topilmadi: #${update.id}`);
  const status = update.status ? oneOf(TASK_STATUSES, update.status, "status") : null;
  const evidence = nn(update.evidence) ?? current.evidence;
  if (status === "tugallangan" && !evidence) {
    throw new StoreError("“Tugallangan” uchun dalil kerak: fayl, havola, API natijasi yoki tasdiqlangan yozuv (evidence).");
  }
  if (status === "tosiq_bor" && !(nn(update.blocker) ?? current.blocker)) {
    throw new StoreError("“To‘siq bor” uchun to‘siq tavsifi (blocker) kerak.");
  }
  const priority = update.priority ? oneOf(PRIORITIES, update.priority, "priority") : null;
  await db.query(
    `UPDATE tasks SET
       status = COALESCE($2, status), evidence = COALESCE($3, evidence), blocker = COALESCE($4, blocker),
       title = COALESCE($5, title), priority = COALESCE($6, priority), owner = COALESCE($7, owner),
       due_at = COALESCE($8, due_at), done_criteria = COALESCE($9, done_criteria),
       completed_at = CASE WHEN $2::text = 'tugallangan' THEN now() WHEN $2::text IS NOT NULL THEN NULL ELSE completed_at END,
       updated_at = now()
     WHERE id = $1`,
    [update.id, status, nn(update.evidence), nn(update.blocker), nn(update.title), priority, nn(update.owner),
      toDate(update.due_at, "due_at"), nn(update.done_criteria)],
  );
  if (status && status !== current.status) {
    await db.query("INSERT INTO task_events (task_id, from_status, to_status, note) VALUES ($1, $2, $3, $4)", [
      update.id, current.status, status, nn(update.note),
    ]);
  }
  return (await getTask(db, update.id))!;
}

// ───────────────────────── facts (memory) ─────────────────────────

export interface FactRow {
  id: number;
  kind: FactKind;
  subject: string;
  content: string;
  status: FactStatus;
  source: string;
  updated_at: Date;
}

export async function saveFact(
  db: Db,
  input: { kind: string; subject: string; content: string; status: string; source: string },
): Promise<FactRow> {
  const kind = oneOf(FACT_KINDS, input.kind, "kind");
  const status = oneOf(FACT_STATUSES, input.status, "status");
  const subject = nn(input.subject);
  const content = nn(input.content);
  const source = nn(input.source);
  if (!subject || !content || !source) throw new StoreError("subject, content va source kerak.");
  if (looksLikeSecret(`${subject} ${content} ${source}`)) {
    throw new StoreError("Bu matnda maxfiy ma’lumot (token, kalit, parol yoki karta raqami) bor. Xotiraga saqlanmaydi.");
  }
  const { rows } = await db.query<FactRow>(
    "INSERT INTO facts (kind, subject, content, status, source) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [kind, subject, content, status, source],
  );
  return rows[0]!;
}

export async function listFacts(db: Db, filter: { kind?: string; subject?: string } = {}): Promise<FactRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) {
    params.push(oneOf(FACT_KINDS, filter.kind, "kind"));
    where.push(`kind = $${params.length}`);
  }
  if (filter.subject) {
    params.push(`%${filter.subject}%`);
    where.push(`(subject ILIKE $${params.length} OR content ILIKE $${params.length})`);
  }
  return (await db.query<FactRow>(
    `SELECT * FROM facts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT 100`,
    params,
  )).rows;
}

export async function forgetFact(db: Db, id: number): Promise<boolean> {
  const { rows } = await db.query<{ id: number }>("DELETE FROM facts WHERE id = $1 RETURNING id", [id]);
  return rows.length === 1;
}

// ───────────────────────── settings ─────────────────────────

export type ReportKind = "morning" | "daily" | "weekly" | "monthly";

export interface ReportSchedule {
  enabled: boolean;
  time: string; // HH:MM local
  weekday?: number; // weekly: 0 = Sunday
  day?: number; // monthly: day of month
}

export interface Settings {
  timezone: string;
  paused: boolean;
  paused_exceptions: ReportKind[];
  reports: Record<ReportKind, ReportSchedule>;
  quiet_hours: { start: string; end: string };
  reminder_minutes: number[];
  voice_replies: boolean;
  editing_approval_id: number | null;
}

export function defaultSettings(timezone = "Asia/Tashkent"): Settings {
  return {
    timezone,
    paused: false,
    paused_exceptions: [],
    reports: {
      morning: { enabled: true, time: "09:00" },
      daily: { enabled: true, time: "21:00" },
      weekly: { enabled: true, time: "19:00", weekday: 0 },
      monthly: { enabled: true, time: "10:00", day: 1 },
    },
    quiet_hours: { start: "23:00", end: "08:00" },
    reminder_minutes: [30, 10],
    voice_replies: false,
    editing_approval_id: null,
  };
}

export async function getSettings(db: Db, timezone = "Asia/Tashkent"): Promise<Settings> {
  const { rows } = await db.query<{ value: Partial<Settings> }>("SELECT value FROM settings WHERE key = 'app'");
  const base = defaultSettings(timezone);
  const stored = rows[0]?.value ?? {};
  return {
    ...base,
    ...stored,
    reports: { ...base.reports, ...(stored.reports ?? {}) },
    quiet_hours: { ...base.quiet_hours, ...(stored.quiet_hours ?? {}) },
  };
}

export function validateSettings(s: Settings): void {
  if (!isValidTimezone(s.timezone)) throw new StoreError(`Vaqt zonasi noto‘g‘ri: ${s.timezone}`);
  for (const [kind, r] of Object.entries(s.reports)) {
    if (!parseHm(r.time)) throw new StoreError(`${kind} hisobot vaqti HH:MM bo‘lishi kerak: ${r.time}`);
    if (r.weekday !== undefined && !(r.weekday >= 0 && r.weekday <= 6)) throw new StoreError("weekday 0–6 bo‘lishi kerak (0 = yakshanba).");
    if (r.day !== undefined && !(r.day >= 1 && r.day <= 28)) throw new StoreError("Oylik hisobot kuni 1–28 oralig‘ida bo‘lsin.");
  }
  if (!parseHm(s.quiet_hours.start) || !parseHm(s.quiet_hours.end)) throw new StoreError("Tinch vaqt HH:MM formatida bo‘lsin.");
  if (!s.reminder_minutes.every((m) => Number.isInteger(m) && m > 0 && m <= 1440)) throw new StoreError("Eslatma daqiqalari 1–1440.");
}

export async function updateSettings(db: Db, patch: Partial<Settings>, timezone = "Asia/Tashkent"): Promise<Settings> {
  const current = await getSettings(db, timezone);
  const next: Settings = {
    ...current,
    ...patch,
    reports: {
      ...current.reports,
      ...Object.fromEntries(
        Object.entries(patch.reports ?? {}).map(([k, v]) => [k, { ...current.reports[k as ReportKind], ...v }]),
      ),
    } as Settings["reports"],
    quiet_hours: { ...current.quiet_hours, ...(patch.quiet_hours ?? {}) },
  };
  validateSettings(next);
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('app', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)],
  );
  return next;
}

// ───────────────────────── approvals ─────────────────────────

export interface ApprovalRow {
  id: number;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  recipient: string;
  scheduled_for: Date | null;
  cost_estimate: string | null;
  payload_hash: string;
  status: string;
  telegram_message_id: string | null;
  result: string | null;
  created_at: Date;
}

export interface ApprovalInput {
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  recipient: string;
  scheduled_for?: string | null;
  cost_estimate?: string | null;
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

/** Version fingerprint: any change to action, payload, recipient, time or cost changes it. */
export function approvalHash(input: ApprovalInput): string {
  return createHash("sha256")
    .update(canonical({
      action_type: input.action_type,
      payload: input.payload,
      recipient: input.recipient,
      scheduled_for: input.scheduled_for ?? null,
      cost_estimate: input.cost_estimate ?? null,
    }))
    .digest("hex");
}

export async function createApproval(db: Db, input: ApprovalInput): Promise<ApprovalRow> {
  if (!nn(input.action_type) || !nn(input.recipient) || !nn(input.summary)) {
    throw new StoreError("action_type, recipient va summary kerak.");
  }
  const scheduled = toDate(input.scheduled_for, "scheduled_for");
  const hash = approvalHash({ ...input, scheduled_for: scheduled?.toISOString() ?? null });
  const { rows } = await db.query<ApprovalRow>(
    `INSERT INTO approvals (action_type, summary, payload, recipient, scheduled_for, cost_estimate, payload_hash)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) RETURNING *`,
    [input.action_type, input.summary, JSON.stringify(input.payload), input.recipient, scheduled, nn(input.cost_estimate), hash],
  );
  return rows[0]!;
}

export async function getApproval(db: Db, id: number): Promise<ApprovalRow | null> {
  const { rows } = await db.query<ApprovalRow>("SELECT * FROM approvals WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function listPendingApprovals(db: Db): Promise<ApprovalRow[]> {
  return (await db.query<ApprovalRow>(
    "SELECT * FROM approvals WHERE status IN ('kutilmoqda', 'tahrirlanmoqda', 'noaniq') ORDER BY created_at",
  )).rows;
}

export type Decision = "approve" | "edit" | "cancel";

/**
 * Atomically moves a pending approval. The decision only applies when the
 * pressed button carries the hash of the *current* version.
 */
export async function decideApproval(
  db: Db,
  id: number,
  hashPrefix: string,
  decision: Decision,
): Promise<{ ok: true; approval: ApprovalRow } | { ok: false; reason: string }> {
  const current = await getApproval(db, id);
  if (!current) return { ok: false, reason: "Tasdiq topilmadi." };
  if (!current.payload_hash.startsWith(hashPrefix) || hashPrefix.length < 8) {
    return { ok: false, reason: "Bu tugma eski versiyaga tegishli. Matn yoki oluvchi o‘zgargan — yangi tasdiqni ishlating." };
  }
  if (current.status !== "kutilmoqda") {
    return { ok: false, reason: `Bu tasdiq allaqachon hal qilingan (holat: ${current.status}).` };
  }
  const nextStatus = decision === "approve" ? "bajarilmoqda" : decision === "edit" ? "tahrirlanmoqda" : "bekor_qilindi";
  const { rows } = await db.query<ApprovalRow>(
    `UPDATE approvals SET status = $3, decided_at = now()
     WHERE id = $1 AND payload_hash = $2 AND status = 'kutilmoqda' RETURNING *`,
    [id, current.payload_hash, nextStatus],
  );
  if (!rows[0]) return { ok: false, reason: "Tasdiq holati shu payt o‘zgardi. Qayta tekshiring." };
  return { ok: true, approval: rows[0] };
}

export async function finishApproval(db: Db, id: number, status: "bajarildi" | "xato" | "noaniq", result: string): Promise<void> {
  await db.query("UPDATE approvals SET status = $2, result = $3, executed_at = now() WHERE id = $1", [id, status, result]);
}

export async function setApprovalMessageId(db: Db, id: number, messageId: string): Promise<void> {
  await db.query("UPDATE approvals SET telegram_message_id = $2 WHERE id = $1", [id, messageId]);
}

export async function supersedeApproval(db: Db, id: number): Promise<void> {
  await db.query("UPDATE approvals SET status = 'bekor_qilindi', result = 'yangi versiya bilan almashtirildi' WHERE id = $1 AND status IN ('kutilmoqda', 'tahrirlanmoqda')", [id]);
}

export async function hasStandingGrant(db: Db, actionType: string, recipient: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM standing_grants WHERE action_type = $1 AND recipient = $2 AND revoked_at IS NULL LIMIT 1",
    [actionType, recipient],
  );
  return rows.length > 0;
}

export async function grantStanding(db: Db, actionType: string, recipient: string, note?: string): Promise<void> {
  if (!(await hasStandingGrant(db, actionType, recipient))) {
    await db.query("INSERT INTO standing_grants (action_type, recipient, note) VALUES ($1, $2, $3)", [actionType, recipient, note ?? null]);
  }
}

export async function revokeStanding(db: Db, actionType: string, recipient: string): Promise<number> {
  const { rows } = await db.query(
    "UPDATE standing_grants SET revoked_at = now() WHERE action_type = $1 AND recipient = $2 AND revoked_at IS NULL RETURNING id",
    [actionType, recipient],
  );
  return rows.length;
}

// ───────────────────────── reports & throttling ─────────────────────────

export async function claimReportRun(db: Db, dedupeKey: string, reportType: string, periodKey: string, status = "yuborilmoqda"): Promise<boolean> {
  const { rows } = await db.query(
    `INSERT INTO report_runs (dedupe_key, report_type, period_key, status) VALUES ($1, $2, $3, $4)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING dedupe_key`,
    [dedupeKey, reportType, periodKey, status],
  );
  return rows.length === 1;
}

/** Re-claims a run that failed definitively, for a bounded number of retries. */
export async function reclaimFailedReportRun(db: Db, dedupeKey: string, maxAttempts: number, minDelayMs: number): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE report_runs SET status = 'yuborilmoqda', attempts = attempts + 1, updated_at = now()
     WHERE dedupe_key = $1 AND status = 'xato' AND attempts < $2
       AND updated_at < now() - ($3::text || ' milliseconds')::interval
     RETURNING dedupe_key`,
    [dedupeKey, maxAttempts, String(minDelayMs)],
  );
  return rows.length === 1;
}

export async function finishReportRun(db: Db, dedupeKey: string, status: "yuborildi" | "xato" | "noaniq", detail: { messageId?: string; error?: string } = {}): Promise<void> {
  await db.query(
    "UPDATE report_runs SET status = $2, message_id = $3, error = $4, updated_at = now() WHERE dedupe_key = $1",
    [dedupeKey, status, detail.messageId ?? null, detail.error ?? null],
  );
}

export async function lastReportRuns(db: Db, limit = 5): Promise<Array<{ dedupe_key: string; status: string; updated_at: Date; error: string | null }>> {
  return (await db.query<{ dedupe_key: string; status: string; updated_at: Date; error: string | null }>(
    "SELECT dedupe_key, status, updated_at, error FROM report_runs ORDER BY updated_at DESC LIMIT $1",
    [limit],
  )).rows;
}

/** True when a notification with this key may be sent now (rate limit per key). */
export async function allowNotification(db: Db, key: string, minIntervalMs: number, now = new Date()): Promise<boolean> {
  const { rows } = await db.query(
    `INSERT INTO notify_throttle (key, last_sent_at) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at, count = notify_throttle.count + 1
       WHERE notify_throttle.last_sent_at < $2::timestamptz - ($3::text || ' milliseconds')::interval
     RETURNING key`,
    [key, now, String(minIntervalMs)],
  );
  return rows.length === 1;
}

export async function recordIntegrationEvent(db: Db, name: string, state: string, detail: string): Promise<void> {
  await db.query(
    `INSERT INTO integration_events (name, state, detail, checked_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (name) DO UPDATE SET state = EXCLUDED.state, detail = EXCLUDED.detail, checked_at = now()`,
    [name, state, detail],
  );
}

export async function integrationEvents(db: Db): Promise<Record<string, { state: string; detail: string | null; checked_at: Date }>> {
  const { rows } = await db.query<{ name: string; state: string; detail: string | null; checked_at: Date }>("SELECT * FROM integration_events");
  return Object.fromEntries(rows.map((r) => [r.name, r]));
}
