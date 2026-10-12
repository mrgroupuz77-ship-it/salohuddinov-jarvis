// Database schema. Migrations are append-only: never edit an applied one,
// add a new entry instead. Every statement is idempotent.

export interface Migration {
  version: string;
  sql: string;
}

export const TASK_STATUSES = [
  "yangi",
  "rejalashtirilgan",
  "bajarilmoqda",
  "tekshiruvda",
  "tasdiq_kutilmoqda",
  "tugallangan",
  "tosiq_bor",
  "xato",
  "bekor_qilingan",
] as const;

export const OPEN_TASK_STATUSES = [
  "yangi",
  "rejalashtirilgan",
  "bajarilmoqda",
  "tekshiruvda",
  "tasdiq_kutilmoqda",
  "tosiq_bor",
] as const;

export const PRIORITIES = ["past", "orta", "yuqori", "shoshilinch"] as const;

export const PROJECT_STATUSES = ["faol", "pauza", "yakunlangan", "aniqlanmagan"] as const;

export const CLIENT_STAGES = [
  "yangi_murojaat",
  "saralash",
  "uchrashuv",
  "taklif",
  "kelishuv",
  "faol",
  "toxtatilgan",
  "yakunlangan",
  "yoqotilgan",
] as const;

export const FACT_KINDS = ["fakt", "afzallik", "uslub_qoidasi", "ruxsat"] as const;
export const FACT_STATUSES = ["tasdiqlangan", "foydalanuvchi_bergan", "taxmin", "tekshirish_kerak"] as const;

export const APPROVAL_STATUSES = [
  "kutilmoqda",
  "tahrirlanmoqda",
  "bekor_qilindi",
  "bajarilmoqda",
  "bajarildi",
  "xato",
  "noaniq",
] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

export const MIGRATIONS: Migration[] = [
  {
    version: "001_init",
    sql: `
CREATE TABLE IF NOT EXISTS processed_updates (
  key TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aniqlanmagan' CHECK (status IN (${list(PROJECT_STATUSES)})),
  goal TEXT,
  audience TEXT,
  offer TEXT,
  style_notes TEXT,
  kpis TEXT,
  owners TEXT,
  next_step TEXT,
  blockers TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_source TEXT,
  service TEXT,
  need TEXT,
  stage TEXT NOT NULL DEFAULT 'yangi_murojaat' CHECK (stage IN (${list(CLIENT_STAGES)})),
  last_contact_at TIMESTAMPTZ,
  next_step TEXT,
  due_at TIMESTAMPTZ,
  owner TEXT,
  documents TEXT,
  lost_reason TEXT,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'yangi' CHECK (status IN (${list(TASK_STATUSES)})),
  priority TEXT NOT NULL DEFAULT 'orta' CHECK (priority IN (${list(PRIORITIES)})),
  owner TEXT,
  due_at TIMESTAMPTZ,
  done_criteria TEXT,
  evidence TEXT,
  blocker TEXT,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  source_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(due_at);

CREATE TABLE IF NOT EXISTS task_events (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_events_created_idx ON task_events(created_at);

CREATE TABLE IF NOT EXISTS facts (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (${list(FACT_KINDS)})),
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${list(FACT_STATUSES)})),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  recipient TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  cost_estimate TEXT,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'kutilmoqda' CHECK (status IN (${list(APPROVAL_STATUSES)})),
  telegram_message_id TEXT,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS standing_grants (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  note TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS report_runs (
  dedupe_key TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yuborilmoqda', 'yuborildi', 'xato', 'noaniq', 'otkazildi')),
  attempts INT NOT NULL DEFAULT 1,
  message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notify_throttle (
  key TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS integration_events (
  name TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  detail TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  },
  {
    version: "002_seed_known_projects",
    sql: `
INSERT INTO projects (slug, name, status, source) VALUES
  ('kosimov_study', 'kosimov_study', 'aniqlanmagan', 'oldingi ishlarda tilga olingan (Jarvis prompti, 2026-10-12)'),
  ('infranchise', 'inFranchise', 'aniqlanmagan', 'oldingi ishlarda tilga olingan (Jarvis prompti, 2026-10-12)'),
  ('jurabek_kulnazarov', 'Jurabek Kulnazarov', 'aniqlanmagan', 'oldingi ishlarda tilga olingan (Jarvis prompti, 2026-10-12)'),
  ('bozorbuva', 'bozorbuva', 'aniqlanmagan', 'oldingi ishlarda tilga olingan (Jarvis prompti, 2026-10-12)'),
  ('oscar_sergeli_auto', 'Oscar/Sergeli Auto', 'aniqlanmagan', 'oldingi ishlarda tilga olingan (Jarvis prompti, 2026-10-12)'),
  ('aziza_cosmetolog', 'Aziza cosmetolog', 'aniqlanmagan', 'oldingi ishlarda tilga olingan (Jarvis prompti, 2026-10-12)')
ON CONFLICT (slug) DO NOTHING;
`,
  },
];
