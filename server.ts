import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import expressModule from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import pgModule from 'pg';

const express = ((expressModule as unknown as { default?: typeof expressModule }).default ||
  expressModule) as typeof expressModule;
const pgResolved = pgModule as unknown as {
  Pool?: typeof pgModule.Pool;
  default?: { Pool?: typeof pgModule.Pool };
};
const Pool = pgResolved.Pool || pgResolved.default?.Pool || pgModule.Pool;

let __filename = '';
try {
  if (
    typeof import.meta !== 'undefined' &&
    typeof import.meta.url === 'string' &&
    import.meta.url.startsWith('file:')
  ) {
    __filename = fileURLToPath(import.meta.url);
  }
} catch {
  __filename = '';
}
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

const IS_VERCEL = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION
);
const PG_CONNECTION_STRING = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_DB_URL ||
  ''
).trim();
const HAS_VALID_PG_URL = /^postgres(ql)?:\/\/.+/i.test(PG_CONNECTION_STRING);
const PG_CONFIG_INVALID =
  PG_CONNECTION_STRING.length > 0 && !HAS_VALID_PG_URL;
const USE_POSTGRES = HAS_VALID_PG_URL;

const RAW_SESSION_SECRET = (process.env.SESSION_SECRET || '').trim();
const SESSION_SECRET_SOURCE: 'env' | 'derived-db' | 'default-fallback' =
  RAW_SESSION_SECRET
    ? 'env'
    : USE_POSTGRES
      ? 'derived-db'
      : 'default-fallback';
const SESSION_SECRET =
  RAW_SESSION_SECRET ||
  (USE_POSTGRES
    ? crypto.createHash('sha256').update(PG_CONNECTION_STRING).digest('hex')
    : 'apt-worklog-stateless-session-secret-v1');

function getEnvDiagnostics() {
  return {
    runtime: IS_VERCEL ? 'vercel' : 'node',
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null,
    hasDatabaseUrl: PG_CONNECTION_STRING.length > 0,
    databaseUrlValid: HAS_VALID_PG_URL,
    pgConfigInvalid: PG_CONFIG_INVALID,
    hasSessionSecret: RAW_SESSION_SECRET.length > 0,
    sessionSecretSource: SESSION_SECRET_SOURCE,
    hasCustomCompanyPassword:
      (process.env.COMPANY_SHARED_PASSWORD || '').trim().length > 0,
    hasCustomAdminPassword:
      (process.env.ADMIN_PASSWORD || '').trim().length > 0,
    hasCustomMasterPassword:
      (process.env.MASTER_ADMIN_PASSWORD || '').trim().length > 0,
  };
}

const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'apt-worklog-data')
  : path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const DEFAULT_APARTMENT_ID = 'apt-horyeoul7';

interface ApartmentRecord {
  id: string;
  name: string;
  officeName: string;
  companyId: string;
  companyPassword: string;
  adminPassword: string;
  createdAt: string;
}

interface WorkerRecord {
  id: string;
  apartmentId: string;
  name: string;
  role: string;
  createdAt: string;
}

type WorkStatus = 'pending' | 'in_progress' | 'completed';

interface WorkLogRecord {
  id: string;
  apartmentId: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  workDate: string;
  location: string;
  content: string;
  status: WorkStatus;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoticeRecord {
  id: string;
  apartmentId: string;
  title: string;
  content: string;
  isPinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

interface HandoverRecord {
  id: string;
  apartmentId: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  targetShift: string;
  content: string;
  status: 'pending' | 'completed';
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type BannerCategory = 'wedding' | 'funeral' | 'celebration' | 'notice';

interface EventBannerRecord {
  id: string;
  apartmentId: string;
  category: BannerCategory;
  title: string;
  subtitle: string;
  eventDate: string;
  eventLocation: string;
  contactInfo: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type AdSlotMode = 'inquiry' | 'custom' | 'adsense' | 'adfit' | 'hidden';

interface ExternalAdRecord {
  apartmentId: string;
  mode: AdSlotMode;
  sponsorName: string;
  headline: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  ctaLabel: string;
  contactInfo: string;
  adsenseClientId: string;
  adsenseSlotId: string;
  adfitUnitId: string;
  updatedAt: string;
}

interface SessionRecord {
  token: string;
  apartmentId: string;
  isAdmin: boolean;
  isMaster?: boolean;
  createdAt: string;
  lastSeenAt: string;
}

interface LegacySettings {
  companyId?: string;
  companyPassword?: string;
  adminPassword?: string;
}

interface StoreData {
  settings?: LegacySettings;
  apartments: ApartmentRecord[];
  workers: WorkerRecord[];
  logs: WorkLogRecord[];
  notices: NoticeRecord[];
  handovers: HandoverRecord[];
  banners?: EventBannerRecord[];
  externalAds?: Record<string, ExternalAdRecord>;
  globalAd?: ExternalAdRecord;
  sessions: Record<string, SessionRecord>;
}

let memoryStore: StoreData | null = null;
let pgPool: pgModule.Pool | null = null;
let pgInitPromise: Promise<void> | null = null;

function getPgPool(): pgModule.Pool {
  if (!pgPool) {
    const needsSsl =
      PG_CONNECTION_STRING.length > 0 &&
      !/localhost|127\.0\.0\.1|sslmode=disable/i.test(PG_CONNECTION_STRING);
    pgPool = new Pool({
      connectionString: PG_CONNECTION_STRING,
      max: IS_VERCEL ? 5 : 10,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pgPool;
}

function getKoreaDateString(offsetDays = 0): string {
  const now = new Date();
  const seoulOffsetMs = 9 * 60 * 60 * 1000;
  const seoulDate = new Date(
    now.getTime() + seoulOffsetMs + offsetDays * 24 * 60 * 60 * 1000
  );
  return seoulDate.toISOString().slice(0, 10);
}

function createSeedNotices(): NoticeRecord[] {
  const nowIso = new Date().toISOString();
  const earlierIso = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: 'notice-seed-1',
      apartmentId: DEFAULT_APARTMENT_ID,
      title: '동절기 지하주차장 배관 및 옥외 수도 동파 예방 순찰 강화',
      content:
        '야간 기온 하강에 따라 지하주차장 램프 입구 및 옥외 공용 수전 보온재 상태를 주야간 교대 시 1회 이상 점검하여 이상 발견 시 즉시 작업일지에 기록 바랍니다.',
      isPinned: true,
      authorName: '김철수',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'notice-seed-2',
      apartmentId: DEFAULT_APARTMENT_ID,
      title: '11월 승강기 정기 안전점검 일정 안내 (701~706동)',
      content:
        '금주 목요일 09:30~16:00 전 동 승강기 월간 점검이 진행됩니다. 점검 업체 도착 시 기계실 열쇠 불출 및 동행 안내 협조 부탁드립니다.',
      isPinned: false,
      authorName: '이영희',
      createdAt: earlierIso,
      updatedAt: earlierIso,
    },
  ];
}

function createSeedHandovers(): HandoverRecord[] {
  const nowIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const earlierIso = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: 'handover-seed-1',
      apartmentId: DEFAULT_APARTMENT_ID,
      workerId: 'w-3',
      workerName: '박민수',
      workerRole: '전기기사',
      targetShift: '주간/익일',
      content:
        '702동 3라인 승강기 비상통화장치 간헐적 잡음 민원 접수됨. 내일 오전 09:30 점검 기사 방문 예정이니 1차 확인 부탁드립니다.',
      status: 'pending',
      completedBy: null,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'handover-seed-2',
      apartmentId: DEFAULT_APARTMENT_ID,
      workerId: 'w-1',
      workerName: '김철수',
      workerRole: '시설과장',
      targetShift: '야간/당직',
      content:
        '정문 차단기 비상용 리모컨 2개 건전지 교체 완료. 여분 배터리는 관리사무소 당직 책상 좌측 서랍에 보관했습니다.',
      status: 'completed',
      completedBy: '이영희',
      completedAt: earlierIso,
      createdAt: earlierIso,
      updatedAt: earlierIso,
    },
  ];
}

function createInitialStore(): StoreData {
  const today = getKoreaDateString(0);
  const yesterday = getKoreaDateString(-1);
  const nowIso = new Date().toISOString();

  return {
    apartments: [
      {
        id: DEFAULT_APARTMENT_ID,
        name: '호려울마을 7단지',
        officeName: '호려울마을 7단지 관리사무소',
        companyId: 'horyeoul7',
        companyPassword:
          (process.env.COMPANY_SHARED_PASSWORD || '').trim() || '7777',
        adminPassword:
          (process.env.ADMIN_PASSWORD || '').trim() || 'admin7777',
        createdAt: nowIso,
      },
    ],
    workers: [
      {
        id: 'w-1',
        apartmentId: DEFAULT_APARTMENT_ID,
        name: '김철수',
        role: '시설과장',
        createdAt: nowIso,
      },
      {
        id: 'w-2',
        apartmentId: DEFAULT_APARTMENT_ID,
        name: '이영희',
        role: '관리주임',
        createdAt: nowIso,
      },
      {
        id: 'w-3',
        apartmentId: DEFAULT_APARTMENT_ID,
        name: '박민수',
        role: '전기기사',
        createdAt: nowIso,
      },
      {
        id: 'w-4',
        apartmentId: DEFAULT_APARTMENT_ID,
        name: '정수진',
        role: '서무주임',
        createdAt: nowIso,
      },
    ],
    logs: [
      {
        id: 'log-seed-1',
        apartmentId: DEFAULT_APARTMENT_ID,
        workerId: 'w-1',
        workerName: '김철수',
        workerRole: '시설과장',
        workDate: today,
        location: '701동 지하1층 주차장',
        content:
          '지하1층 B구역 천장 LED 센서등 점등 불량 2개소 안정기 및 등기구 신품 교체 완료',
        status: 'completed',
        photoUrl: '/src/assets/images/apt_led_lighting_1794997917687.jpg',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'log-seed-2',
        apartmentId: DEFAULT_APARTMENT_ID,
        workerId: 'w-2',
        workerName: '이영희',
        workerRole: '관리주임',
        workDate: today,
        location: '704동~705동 중앙 보행로',
        content:
          '중앙 보행로 우수 배수로 트렌치 내 낙엽 및 토사 제거 청소, 주변 관목 전정 정비 작업 진행',
        status: 'in_progress',
        photoUrl: '/src/assets/images/apt_garden_drain_1794997918597.jpg',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'log-seed-3',
        apartmentId: DEFAULT_APARTMENT_ID,
        workerId: 'w-3',
        workerName: '박민수',
        workerRole: '전기기사',
        workDate: yesterday,
        location: '단지 내 어린이놀이터',
        content:
          '놀이터 조합놀이대 볼트 체결 및 탄성포장재 보수 자재 입고 후 추가 점검 대기',
        status: 'pending',
        photoUrl: '/src/assets/images/apt_playground_check_1794997919697.jpg',
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      },
    ],
    notices: createSeedNotices(),
    handovers: createSeedHandovers(),
    banners: [],
    externalAds: {},
    globalAd: createDefaultExternalAd('__global__'),
    sessions: {},
  };
}

async function ensurePgReady(): Promise<void> {
  if (!USE_POSTGRES) return;
  if (pgInitPromise) return pgInitPromise;

  pgInitPromise = (async () => {
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apartments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        office_name TEXT NOT NULL,
        company_id TEXT NOT NULL UNIQUE,
        company_password TEXT NOT NULL,
        admin_password TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workers_apartment ON workers (apartment_id);

      CREATE TABLE IF NOT EXISTS work_logs (
        id TEXT PRIMARY KEY,
        apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
        worker_id TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        worker_role TEXT NOT NULL,
        work_date TEXT NOT NULL,
        location TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        photo_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_work_logs_apartment_date ON work_logs (apartment_id, work_date DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY,
        apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notices_apartment ON notices (apartment_id, is_pinned DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS handovers (
        id TEXT PRIMARY KEY,
        apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
        worker_id TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        worker_role TEXT NOT NULL,
        target_shift TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        completed_by TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_handovers_apartment ON handovers (apartment_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS event_banners (
        id TEXT PRIMARY KEY,
        apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        event_date TEXT NOT NULL DEFAULT '',
        event_location TEXT NOT NULL DEFAULT '',
        contact_info TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_event_banners_apartment ON event_banners (apartment_id, is_active DESC, updated_at DESC);

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        apartment_id TEXT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        is_master BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions (last_seen_at);

      CREATE TABLE IF NOT EXISTS external_ads (
        apartment_id TEXT PRIMARY KEY REFERENCES apartments(id) ON DELETE CASCADE,
        mode TEXT NOT NULL DEFAULT 'inquiry',
        sponsor_name TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        link_url TEXT NOT NULL DEFAULT '',
        cta_label TEXT NOT NULL DEFAULT '',
        contact_info TEXT NOT NULL DEFAULT '',
        adsense_client_id TEXT NOT NULL DEFAULT '',
        adsense_slot_id TEXT NOT NULL DEFAULT '',
        adfit_unit_id TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS global_ad_slot (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'inquiry',
        sponsor_name TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        link_url TEXT NOT NULL DEFAULT '',
        cta_label TEXT NOT NULL DEFAULT '',
        contact_info TEXT NOT NULL DEFAULT '',
        adsense_client_id TEXT NOT NULL DEFAULT '',
        adsense_slot_id TEXT NOT NULL DEFAULT '',
        adfit_unit_id TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `);

    const countRes = await pool.query<{ cnt: number }>(
      'SELECT COUNT(*)::int AS cnt FROM apartments'
    );
    if ((countRes.rows[0]?.cnt ?? 0) === 0) {
      const seed = createInitialStore();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const apt of seed.apartments) {
          await client.query(
            `INSERT INTO apartments (id, name, office_name, company_id, company_password, admin_password, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
            [
              apt.id,
              apt.name,
              apt.officeName,
              apt.companyId,
              apt.companyPassword,
              apt.adminPassword,
              apt.createdAt,
            ]
          );
        }
        for (const w of seed.workers) {
          await client.query(
            `INSERT INTO workers (id, apartment_id, name, role, created_at)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
            [w.id, w.apartmentId, w.name, w.role, w.createdAt]
          );
        }
        for (const l of seed.logs) {
          await client.query(
            `INSERT INTO work_logs (id, apartment_id, worker_id, worker_name, worker_role, work_date, location, content, status, photo_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
            [
              l.id,
              l.apartmentId,
              l.workerId,
              l.workerName,
              l.workerRole,
              l.workDate,
              l.location,
              l.content,
              l.status,
              l.photoUrl,
              l.createdAt,
              l.updatedAt,
            ]
          );
        }
        for (const n of seed.notices) {
          await client.query(
            `INSERT INTO notices (id, apartment_id, title, content, is_pinned, author_name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
            [
              n.id,
              n.apartmentId,
              n.title,
              n.content,
              n.isPinned,
              n.authorName,
              n.createdAt,
              n.updatedAt,
            ]
          );
        }
        for (const h of seed.handovers) {
          await client.query(
            `INSERT INTO handovers (id, apartment_id, worker_id, worker_name, worker_role, target_shift, content, status, completed_by, completed_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
            [
              h.id,
              h.apartmentId,
              h.workerId,
              h.workerName,
              h.workerRole,
              h.targetShift,
              h.content,
              h.status,
              h.completedBy,
              h.completedAt,
              h.createdAt,
              h.updatedAt,
            ]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  })().catch((err) => {
    pgInitPromise = null;
    throw err;
  });

  return pgInitPromise;
}

function ensureStorage(): void {
  if (USE_POSTGRES) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial = memoryStore || createInitialStore();
      memoryStore = initial;
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    }
  } catch {
    if (!memoryStore) {
      memoryStore = createInitialStore();
    }
  }
}

function readStore(): StoreData {
  if (IS_VERCEL && memoryStore) {
    return memoryStore;
  }
  ensureStorage();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreData;
    let mutated = false;

    if (!Array.isArray(parsed.apartments) || parsed.apartments.length === 0) {
      parsed.apartments = [
        {
          id: DEFAULT_APARTMENT_ID,
          name: '호려울마을 7단지',
          officeName: '호려울마을 7단지 관리사무소',
          companyId: parsed.settings?.companyId || 'horyeoul7',
          companyPassword:
            parsed.settings?.companyPassword ||
            (process.env.COMPANY_SHARED_PASSWORD || '').trim() ||
            '7777',
          adminPassword:
            parsed.settings?.adminPassword ||
            (process.env.ADMIN_PASSWORD || '').trim() ||
            'admin7777',
          createdAt: new Date().toISOString(),
        },
      ];
      mutated = true;
    }

    if (!parsed.sessions) parsed.sessions = {};
    if (!parsed.workers) parsed.workers = [];
    if (!parsed.logs) parsed.logs = [];
    if (!Array.isArray(parsed.notices)) {
      parsed.notices = createSeedNotices();
      mutated = true;
    }
    if (!Array.isArray(parsed.handovers)) {
      parsed.handovers = createSeedHandovers();
      mutated = true;
    }
    if (!Array.isArray(parsed.banners)) {
      parsed.banners = [];
      mutated = true;
    }
    if (!parsed.externalAds || typeof parsed.externalAds !== 'object') {
      parsed.externalAds = {};
      mutated = true;
    }
    if (!parsed.globalAd || typeof parsed.globalAd !== 'object') {
      parsed.globalAd = createDefaultExternalAd('__global__');
      mutated = true;
    }

    for (const w of parsed.workers) {
      if (!w.apartmentId) {
        w.apartmentId = DEFAULT_APARTMENT_ID;
        mutated = true;
      }
    }
    for (const l of parsed.logs) {
      if (!l.apartmentId) {
        l.apartmentId = DEFAULT_APARTMENT_ID;
        mutated = true;
      }
      if (!l.status) {
        l.status = 'completed';
        mutated = true;
      }
    }
    for (const n of parsed.notices) {
      if (!n.apartmentId) {
        n.apartmentId = DEFAULT_APARTMENT_ID;
        mutated = true;
      }
    }
    for (const h of parsed.handovers) {
      if (!h.apartmentId) {
        h.apartmentId = DEFAULT_APARTMENT_ID;
        mutated = true;
      }
    }
    for (const s of Object.values(parsed.sessions)) {
      if (!s.apartmentId) {
        s.apartmentId = DEFAULT_APARTMENT_ID;
        mutated = true;
      }
    }

    memoryStore = parsed;
    if (mutated) {
      writeStore(parsed);
    }
    return parsed;
  } catch {
    if (!memoryStore) {
      memoryStore = createInitialStore();
    }
    writeStore(memoryStore);
    return memoryStore;
  }
}

function writeStore(data: StoreData): void {
  memoryStore = data;
  try {
    ensureStorage();
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch {
    // Keep memoryStore as fallback on read-only serverless filesystems
  }
}

function toPublicApartment(apt: ApartmentRecord) {
  return {
    id: apt.id,
    name: apt.name,
    officeName: apt.officeName,
    companyId: apt.companyId,
    createdAt: apt.createdAt,
  };
}

function mapApartmentRow(r: Record<string, unknown>): ApartmentRecord {
  return {
    id: String(r.id),
    name: String(r.name),
    officeName: String(r.office_name),
    companyId: String(r.company_id),
    companyPassword: String(r.company_password),
    adminPassword: String(r.admin_password),
    createdAt: String(r.created_at),
  };
}

function mapWorkerRow(r: Record<string, unknown>): WorkerRecord {
  return {
    id: String(r.id),
    apartmentId: String(r.apartment_id),
    name: String(r.name),
    role: String(r.role),
    createdAt: String(r.created_at),
  };
}

function mapLogRow(r: Record<string, unknown>): WorkLogRecord {
  const rawStatus = String(r.status || 'completed');
  const status: WorkStatus =
    rawStatus === 'pending' || rawStatus === 'in_progress'
      ? rawStatus
      : 'completed';
  return {
    id: String(r.id),
    apartmentId: String(r.apartment_id),
    workerId: String(r.worker_id),
    workerName: String(r.worker_name),
    workerRole: String(r.worker_role),
    workDate: String(r.work_date),
    location: String(r.location),
    content: String(r.content),
    status,
    photoUrl: r.photo_url ? String(r.photo_url) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapNoticeRow(r: Record<string, unknown>): NoticeRecord {
  return {
    id: String(r.id),
    apartmentId: String(r.apartment_id),
    title: String(r.title),
    content: String(r.content),
    isPinned: Boolean(r.is_pinned),
    authorName: String(r.author_name),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapHandoverRow(r: Record<string, unknown>): HandoverRecord {
  return {
    id: String(r.id),
    apartmentId: String(r.apartment_id),
    workerId: String(r.worker_id),
    workerName: String(r.worker_name),
    workerRole: String(r.worker_role),
    targetShift: String(r.target_shift),
    content: String(r.content),
    status: r.status === 'completed' ? 'completed' : 'pending',
    completedBy: r.completed_by ? String(r.completed_by) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapBannerRow(r: Record<string, unknown>): EventBannerRecord {
  const cat = String(r.category || 'notice');
  const category: BannerCategory =
    cat === 'wedding' ||
    cat === 'funeral' ||
    cat === 'celebration' ||
    cat === 'notice'
      ? cat
      : 'notice';
  return {
    id: String(r.id),
    apartmentId: String(r.apartment_id),
    category,
    title: String(r.title),
    subtitle: String(r.subtitle || ''),
    eventDate: String(r.event_date || ''),
    eventLocation: String(r.event_location || ''),
    contactInfo: String(r.contact_info || ''),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function createDefaultExternalAd(apartmentId: string): ExternalAdRecord {
  return {
    apartmentId,
    mode: 'inquiry',
    sponsorName: '지역 상가 · 파트너 광고 영역',
    headline: '이 자리에 외부 광고 및 제휴 배너를 게재할 수 있습니다',
    description:
      '단지 인근 상가·협력업체 배너, Google AdSense, 카카오 애드핏 연동을 지원합니다.',
    imageUrl: '',
    linkUrl: '',
    ctaLabel: '자세히 보기',
    contactInfo: '관리자 메뉴 > 하단 외부 광고 설정에서 변경 가능',
    adsenseClientId: '',
    adsenseSlotId: '',
    adfitUnitId: '',
    updatedAt: new Date().toISOString(),
  };
}

function mapExternalAdRow(r: Record<string, unknown>): ExternalAdRecord {
  const rawMode = String(r.mode || 'inquiry');
  const validModes: AdSlotMode[] = [
    'inquiry',
    'custom',
    'adsense',
    'adfit',
    'hidden',
  ];
  const mode: AdSlotMode = validModes.includes(rawMode as AdSlotMode)
    ? (rawMode as AdSlotMode)
    : 'inquiry';
  return {
    apartmentId: String(r.apartment_id || '__global__'),
    mode,
    sponsorName: String(r.sponsor_name || ''),
    headline: String(r.headline || ''),
    description: String(r.description || ''),
    imageUrl: String(r.image_url || ''),
    linkUrl: String(r.link_url || ''),
    ctaLabel: String(r.cta_label || ''),
    contactInfo: String(r.contact_info || ''),
    adsenseClientId: String(r.adsense_client_id || ''),
    adsenseSlotId: String(r.adsense_slot_id || ''),
    adfitUnitId: String(r.adfit_unit_id || ''),
    updatedAt: String(r.updated_at || new Date().toISOString()),
  };
}

function sanitizeExternalHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, 500);
  }
  return '';
}

function createSignedToken(
  apartmentId: string,
  isAdmin: boolean,
  isMaster = false
): string {
  const payload = {
    id: crypto.randomBytes(8).toString('hex'),
    apt: apartmentId,
    adm: isAdmin,
    mst: isMaster,
    iat: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySignedToken(token: string): SessionRecord | null {
  const tokenPrefix = token ? `${token.slice(0, 10)}...` : 'empty';
  const parts = token.split('.');
  if (parts.length !== 2) {
    console.warn('[Auth] Token verification failed: malformed format', {
      tokenPrefix,
      secretSource: SESSION_SECRET_SOURCE,
    });
    return null;
  }
  const [encoded, sig] = parts;
  if (!encoded || !sig) {
    console.warn('[Auth] Token verification failed: missing segment', {
      tokenPrefix,
      secretSource: SESSION_SECRET_SOURCE,
    });
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    console.warn(
      '[Auth] Token verification failed: HMAC signature mismatch (check SESSION_SECRET consistency)',
      {
        tokenPrefix,
        secretSource: SESSION_SECRET_SOURCE,
        hasSessionSecretEnv: RAW_SESSION_SECRET.length > 0,
      }
    );
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as {
      apt?: string;
      adm?: boolean;
      mst?: boolean;
      iat?: number;
    };
    if (!parsed.apt || typeof parsed.iat !== 'number') {
      console.warn('[Auth] Token verification failed: invalid payload', {
        tokenPrefix,
      });
      return null;
    }
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.iat > maxAgeMs) {
      console.warn('[Auth] Token verification failed: token expired', {
        tokenPrefix,
        apt: parsed.apt,
      });
      return null;
    }
    const createdIso = new Date(parsed.iat).toISOString();
    return {
      token,
      apartmentId: parsed.apt,
      isAdmin: Boolean(parsed.adm),
      isMaster: Boolean(parsed.mst),
      createdAt: createdIso,
      lastSeenAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[Auth] Token verification failed: JSON decode error', {
      tokenPrefix,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function saveBase64Photo(dataUrl: string): string | null {
  const match = dataUrl.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!match) return null;

  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('사진 용량은 5MB 이하만 등록할 수 있습니다.');
  }

  if (USE_POSTGRES || IS_VERCEL) {
    return dataUrl;
  }

  try {
    ensureStorage();
    const filename = `work_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    return `/api/uploads/${filename}`;
  } catch {
    return dataUrl;
  }
}

function deleteUploadedPhotoIfLocal(photoUrl: string | null): void {
  if (!photoUrl || !photoUrl.startsWith('/api/uploads/')) return;
  const filename = path.basename(photoUrl);
  const fullPath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}

interface AuthedRequest extends Request {
  session?: SessionRecord;
}

type AsyncRouteHandler = (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

function asyncHandler(fn: AsyncRouteHandler) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function findSessionByToken(token: string): Promise<SessionRecord | null> {
  if (USE_POSTGRES) {
    try {
      await ensurePgReady();
      const res = await getPgPool().query(
        'SELECT token, apartment_id, is_admin, is_master, created_at, last_seen_at FROM sessions WHERE token = $1',
        [token]
      );
      const row = res.rows[0];
      if (row) {
        return {
          token: String(row.token),
          apartmentId: String(row.apartment_id),
          isAdmin: Boolean(row.is_admin),
          isMaster: Boolean(row.is_master),
          createdAt: String(row.created_at),
          lastSeenAt: String(row.last_seen_at),
        };
      }
    } catch (err) {
      console.error('[Auth] Session DB lookup failed, falling back to signed token verification:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return verifySignedToken(token);
  }
  const store = readStore();
  return store.sessions[token] || verifySignedToken(token);
}

const requireAuth = asyncHandler(
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      console.warn('[Auth] Missing bearer token on protected route:', {
        method: req.method,
        path: req.originalUrl || req.url,
      });
      res.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }
    const session = await findSessionByToken(token);
    if (!session) {
      console.warn('[Auth] Invalid or expired session token:', {
        method: req.method,
        path: req.originalUrl || req.url,
        secretSource: SESSION_SECRET_SOURCE,
      });
      res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해 주세요.' });
      return;
    }
    req.session = session;
    next();
  }
);

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.session?.isAdmin) {
    res.status(403).json({ error: '관리자 인증이 필요한 기능입니다.' });
    return;
  }
  next();
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function formatKoreanTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function filterAndSortLogs(
  logs: WorkLogRecord[],
  query: { workerId?: string; date?: string; q?: string; status?: string }
): WorkLogRecord[] {
  let result = logs;
  if (query.workerId && query.workerId !== 'all') {
    result = result.filter(
      (l) => l.workerId === query.workerId || l.workerName === query.workerId
    );
  }
  if (query.status && query.status !== 'all') {
    result = result.filter((l) => (l.status || 'completed') === query.status);
  }
  if (query.date && query.date.trim() !== '') {
    const targetDate = query.date.trim();
    result = result.filter((l) => l.workDate === targetDate);
  }
  if (query.q && query.q.trim() !== '') {
    const keyword = query.q.trim().toLowerCase();
    result = result.filter(
      (l) =>
        l.location.toLowerCase().includes(keyword) ||
        l.content.toLowerCase().includes(keyword) ||
        l.workerName.toLowerCase().includes(keyword)
    );
  }
  return [...result].sort((a, b) => {
    if (a.workDate !== b.workDate) {
      return b.workDate.localeCompare(a.workDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function createApp(): Express {
  ensureStorage();
  const envDiagnostics = getEnvDiagnostics();
  console.info('[Server Init] Runtime & auth environment:', {
    ...envDiagnostics,
    storage: USE_POSTGRES ? 'postgres' : IS_VERCEL ? 'memory' : 'file',
  });

  const app = express();
  const jsonParser = express.json({ limit: '10mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.body &&
      typeof req.body === 'object' &&
      !Buffer.isBuffer(req.body) &&
      req.headers['content-type']?.toLowerCase().includes('application/json')
    ) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const logPayload = {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
        storage: USE_POSTGRES ? 'postgres' : IS_VERCEL ? 'memory' : 'file',
      };
      if (res.statusCode >= 500) {
        console.error('[API Response 5xx]', logPayload);
      } else if (res.statusCode >= 400) {
        console.warn('[API Response 4xx]', logPayload);
      } else {
        console.info('[API Response]', logPayload);
      }
    });
    next();
  });

  app.get('/api/uploads/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
      return;
    }
    res.sendFile(fullPath);
  });

  app.get(
    '/api/health',
    asyncHandler(async (_req: Request, res: Response) => {
      const env = getEnvDiagnostics();
      if (USE_POSTGRES) {
        try {
          await ensurePgReady();
          await getPgPool().query('SELECT 1');
          res.json({ ok: true, storage: 'postgres', env });
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err || '');
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: unknown }).code || '')
              : undefined;
          console.error('[Health] PostgreSQL check failed:', { code, msg });
          res.status(503).json({
            ok: false,
            storage: 'postgres',
            env,
            dbError: code || 'PG_ERROR',
            error: '클라우드 DB 연결 상태를 확인해 주세요.',
          });
          return;
        }
      }
      res.json({
        ok: true,
        storage: IS_VERCEL ? 'memory' : 'file',
        env,
        ...(PG_CONFIG_INVALID
          ? {
              pgConfigWarning:
                'DATABASE_URL 값이 올바른 postgres:// 주소 형식이 아니어서 임시 메모리 모드로 동작 중입니다.',
            }
          : {}),
      });
    })
  );

  // Public list of registered apartments
  app.get(
    '/api/apartments',
    asyncHandler(async (_req: Request, res: Response) => {
      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          'SELECT * FROM apartments ORDER BY created_at ASC'
        );
        res.json({
          apartments: result.rows.map(mapApartmentRow).map(toPublicApartment),
        });
        return;
      }
      const store = readStore();
      res.json({
        apartments: store.apartments.map(toPublicApartment),
      });
    })
  );

  // Register a new apartment complex
  app.post(
    '/api/apartments',
    asyncHandler(async (req: Request, res: Response) => {
      const {
        name,
        officeName,
        companyId,
        companyPassword,
        adminPassword,
        autoLogin,
      } = req.body as {
        name?: string;
        officeName?: string;
        companyId?: string;
        companyPassword?: string;
        adminPassword?: string;
        autoLogin?: boolean;
      };

      const cleanName = (name || '').trim();
      const cleanOfficeName =
        (officeName || '').trim() ||
        (cleanName ? `${cleanName} 관리사무소` : '');
      const cleanCompanyId = (companyId || '').trim().toLowerCase();
      const cleanCompanyPw = (companyPassword || '').trim();
      const cleanAdminPw = (adminPassword || '').trim();

      if (!cleanName) {
        res.status(400).json({ error: '아파트 단지명을 입력해 주세요.' });
        return;
      }
      if (!/^[a-z0-9_-]{3,30}$/.test(cleanCompanyId)) {
        res.status(400).json({
          error:
            '공통 아이디는 영문 소문자, 숫자, -, _ 조합 3~30자로 입력해 주세요.',
        });
        return;
      }
      if (cleanCompanyPw.length < 4) {
        res
          .status(400)
          .json({ error: '공통 비밀번호는 4자 이상이어야 합니다.' });
        return;
      }
      if (cleanAdminPw.length < 4) {
        res
          .status(400)
          .json({ error: '관리자 비밀번호는 4자 이상이어야 합니다.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const newApt: ApartmentRecord = {
        id: `apt-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        name: cleanName,
        officeName: cleanOfficeName,
        companyId: cleanCompanyId,
        companyPassword: cleanCompanyPw,
        adminPassword: cleanAdminPw,
        createdAt: nowIso,
      };
      const welcomeNotice: NoticeRecord = {
        id: `notice-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        apartmentId: newApt.id,
        title: `${cleanName} 공동 작업일지 운영 시작 안내`,
        content:
          '관리자 관리 화면에서 직원 명단을 등록하시면 바로 작업일지 작성 및 인수인계 공유를 시작할 수 있습니다.',
        isPinned: true,
        authorName: '관리사무소',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let token: string | undefined;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const dupId = await pool.query(
          'SELECT 1 FROM apartments WHERE LOWER(company_id) = $1 LIMIT 1',
          [cleanCompanyId]
        );
        if (dupId.rows.length > 0) {
          res
            .status(409)
            .json({ error: '이미 사용 중인 회사 공통 아이디입니다.' });
          return;
        }
        const dupName = await pool.query(
          'SELECT 1 FROM apartments WHERE name = $1 LIMIT 1',
          [cleanName]
        );
        if (dupName.rows.length > 0) {
          res.status(409).json({ error: '이미 등록된 아파트 단지명입니다.' });
          return;
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `INSERT INTO apartments (id, name, office_name, company_id, company_password, admin_password, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              newApt.id,
              newApt.name,
              newApt.officeName,
              newApt.companyId,
              newApt.companyPassword,
              newApt.adminPassword,
              newApt.createdAt,
            ]
          );
          await client.query(
            `INSERT INTO notices (id, apartment_id, title, content, is_pinned, author_name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              welcomeNotice.id,
              welcomeNotice.apartmentId,
              welcomeNotice.title,
              welcomeNotice.content,
              welcomeNotice.isPinned,
              welcomeNotice.authorName,
              welcomeNotice.createdAt,
              welcomeNotice.updatedAt,
            ]
          );
          if (autoLogin) {
            token = createSignedToken(newApt.id, true, false);
            await client.query(
              `INSERT INTO sessions (token, apartment_id, is_admin, is_master, created_at, last_seen_at)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [token, newApt.id, true, false, nowIso, nowIso]
            );
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } else {
        const store = readStore();
        if (
          store.apartments.some(
            (a) => a.companyId.toLowerCase() === cleanCompanyId
          )
        ) {
          res
            .status(409)
            .json({ error: '이미 사용 중인 회사 공통 아이디입니다.' });
          return;
        }
        if (store.apartments.some((a) => a.name === cleanName)) {
          res.status(409).json({ error: '이미 등록된 아파트 단지명입니다.' });
          return;
        }

        store.apartments.push(newApt);
        store.notices.unshift(welcomeNotice);

        if (autoLogin) {
          token = createSignedToken(newApt.id, true, false);
          store.sessions[token] = {
            token,
            apartmentId: newApt.id,
            isAdmin: true,
            isMaster: false,
            createdAt: nowIso,
            lastSeenAt: nowIso,
          };
        }
        writeStore(store);
      }

      res.status(201).json({
        apartment: toPublicApartment(newApt),
        token,
        session: token
          ? {
              authenticated: true,
              isAdmin: true,
              isMaster: false,
              companyId: newApt.companyId,
              apartmentId: newApt.id,
              apartmentName: newApt.name,
              officeName: newApt.officeName,
            }
          : undefined,
      });
    })
  );

  // Update current apartment info (Admin only)
  app.patch(
    '/api/apartments/current',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { name, officeName } = req.body as {
        name?: string;
        officeName?: string;
      };
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const existingRes = await pool.query(
          'SELECT * FROM apartments WHERE id = $1',
          [apartmentId]
        );
        if (existingRes.rows.length === 0) {
          res.status(404).json({ error: '아파트 정보를 찾을 수 없습니다.' });
          return;
        }
        const apt = mapApartmentRow(existingRes.rows[0]);
        const cleanName = (name ?? apt.name).trim();
        const cleanOffice =
          (officeName ?? apt.officeName).trim() || `${cleanName} 관리사무소`;
        if (!cleanName) {
          res.status(400).json({ error: '아파트 단지명을 입력해 주세요.' });
          return;
        }
        await pool.query(
          'UPDATE apartments SET name = $1, office_name = $2 WHERE id = $3',
          [cleanName, cleanOffice, apartmentId]
        );
        res.json({
          apartment: toPublicApartment({
            ...apt,
            name: cleanName,
            officeName: cleanOffice,
          }),
        });
        return;
      }

      const store = readStore();
      const apt = store.apartments.find((a) => a.id === apartmentId);
      if (!apt) {
        res.status(404).json({ error: '아파트 정보를 찾을 수 없습니다.' });
        return;
      }

      const cleanName = (name ?? apt.name).trim();
      const cleanOffice =
        (officeName ?? apt.officeName).trim() || `${cleanName} 관리사무소`;
      if (!cleanName) {
        res.status(400).json({ error: '아파트 단지명을 입력해 주세요.' });
        return;
      }

      apt.name = cleanName;
      apt.officeName = cleanOffice;
      writeStore(store);
      res.json({ apartment: toPublicApartment(apt) });
    })
  );

  // Session check
  app.get(
    '/api/auth/session',
    asyncHandler(async (req: Request, res: Response) => {
      const token = extractToken(req);

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const aptsRes = await pool.query(
          'SELECT * FROM apartments ORDER BY created_at ASC'
        );
        const apartments = aptsRes.rows.map(mapApartmentRow);
        const fallbackApt = createInitialStore().apartments[0];
        const defaultApt = apartments[0] || fallbackApt;
        const session = token ? await findSessionByToken(token) : null;

        if (!session) {
          res.json({
            authenticated: false,
            isAdmin: false,
            isMaster: false,
            companyId: defaultApt.companyId,
            apartmentId: defaultApt.id,
            apartmentName: defaultApt.name,
            officeName: defaultApt.officeName,
          });
          return;
        }

        const apt =
          apartments.find((a) => a.id === session.apartmentId) || defaultApt;
        res.json({
          authenticated: true,
          isAdmin: session.isAdmin,
          isMaster: Boolean(session.isMaster),
          companyId: apt.companyId,
          apartmentId: apt.id,
          apartmentName: apt.name,
          officeName: apt.officeName,
        });
        return;
      }

      const store = readStore();
      const defaultApt =
        store.apartments[0] || createInitialStore().apartments[0];
      const session = token ? await findSessionByToken(token) : null;

      if (!session) {
        res.json({
          authenticated: false,
          isAdmin: false,
          isMaster: false,
          companyId: defaultApt.companyId,
          apartmentId: defaultApt.id,
          apartmentName: defaultApt.name,
          officeName: defaultApt.officeName,
        });
        return;
      }

      const apt =
        store.apartments.find((a) => a.id === session.apartmentId) ||
        defaultApt;
      res.json({
        authenticated: true,
        isAdmin: session.isAdmin,
        isMaster: Boolean(session.isMaster),
        companyId: apt.companyId,
        apartmentId: apt.id,
        apartmentName: apt.name,
        officeName: apt.officeName,
      });
    })
  );

  // Shared company login
  app.post(
    '/api/auth/login',
    asyncHandler(async (req: Request, res: Response) => {
      const { companyId, password, apartmentId } = (req.body || {}) as {
        companyId?: string;
        password?: string;
        apartmentId?: string;
      };
      const trimmedId = (companyId || '').trim().toLowerCase();
      const rawPassword = password || '';
      const trimmedPassword = rawPassword.trim();

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        let aptRes = trimmedId
          ? await pool.query(
              'SELECT * FROM apartments WHERE LOWER(company_id) = $1 LIMIT 1',
              [trimmedId]
            )
          : await pool.query('SELECT * FROM apartments WHERE id = $1 LIMIT 1', [
              apartmentId || DEFAULT_APARTMENT_ID,
            ]);
        if (aptRes.rows.length === 0 && apartmentId) {
          aptRes = await pool.query(
            'SELECT * FROM apartments WHERE id = $1 LIMIT 1',
            [apartmentId]
          );
        }
        const apt = aptRes.rows[0] ? mapApartmentRow(aptRes.rows[0]) : null;

        const passwordMatches =
          Boolean(apt) &&
          Boolean(trimmedPassword) &&
          (rawPassword === apt!.companyPassword ||
            trimmedPassword === apt!.companyPassword.trim());

        if (!apt || apt.companyId.toLowerCase() !== trimmedId || !passwordMatches) {
          console.warn('[Auth] Shared login rejected (postgres):', {
            companyId: trimmedId || '(empty)',
            apartmentId: apartmentId || null,
            apartmentFound: Boolean(apt),
            passwordEmpty: !trimmedPassword,
          });
          res.status(401).json({
            error: '회사 공통 아이디 또는 비밀번호가 일치하지 않습니다.',
          });
          return;
        }

        const token = createSignedToken(apt.id, false, false);
        const nowIso = new Date().toISOString();
        try {
          await pool.query(
            `INSERT INTO sessions (token, apartment_id, is_admin, is_master, created_at, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (token) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
            [token, apt.id, false, false, nowIso, nowIso]
          );
          await pool.query(`
            DELETE FROM sessions
            WHERE token IN (
              SELECT token FROM sessions ORDER BY last_seen_at DESC OFFSET 150
            )
          `);
        } catch (sessionErr) {
          console.warn(
            '[Auth] Session persistence warning (continuing with stateless token):',
            sessionErr instanceof Error ? sessionErr.message : String(sessionErr)
          );
        }

        res.json({
          token,
          authenticated: true,
          isAdmin: false,
          isMaster: false,
          companyId: apt.companyId,
          apartmentId: apt.id,
          apartmentName: apt.name,
          officeName: apt.officeName,
        });
        return;
      }

      const store = readStore();
      const apt =
        (trimmedId
          ? store.apartments.find(
              (a) => a.companyId.toLowerCase() === trimmedId
            )
          : undefined) ||
        (apartmentId
          ? store.apartments.find((a) => a.id === apartmentId)
          : undefined);

      const passwordMatches =
        Boolean(apt) &&
        Boolean(trimmedPassword) &&
        (rawPassword === apt!.companyPassword ||
          trimmedPassword === apt!.companyPassword.trim());

        if (!apt || apt.companyId.toLowerCase() !== trimmedId || !passwordMatches) {
          console.warn('[Auth] Shared login rejected (local/memory):', {
            companyId: trimmedId || '(empty)',
            apartmentId: apartmentId || null,
            apartmentFound: Boolean(apt),
            passwordEmpty: !trimmedPassword,
          });
          res.status(401).json({
            error: '회사 공통 아이디 또는 비밀번호가 일치하지 않습니다.',
          });
          return;
        }

      const token = createSignedToken(apt.id, false, false);
      const nowIso = new Date().toISOString();
      store.sessions[token] = {
        token,
        apartmentId: apt.id,
        isAdmin: false,
        isMaster: false,
        createdAt: nowIso,
        lastSeenAt: nowIso,
      };

      const sessionKeys = Object.keys(store.sessions);
      if (sessionKeys.length > 200) {
        const sorted = sessionKeys.sort(
          (a, b) =>
            new Date(store.sessions[a].lastSeenAt).getTime() -
            new Date(store.sessions[b].lastSeenAt).getTime()
        );
        for (const oldKey of sorted.slice(0, sessionKeys.length - 150)) {
          delete store.sessions[oldKey];
        }
      }

      writeStore(store);
      res.json({
        token,
        authenticated: true,
        isAdmin: false,
        isMaster: false,
        companyId: apt.companyId,
        apartmentId: apt.id,
        apartmentName: apt.name,
        officeName: apt.officeName,
      });
    })
  );

  app.post(
    '/api/auth/logout',
    asyncHandler(async (req: Request, res: Response) => {
      const token = extractToken(req);
      if (token) {
        if (USE_POSTGRES) {
          await ensurePgReady();
          await getPgPool().query('DELETE FROM sessions WHERE token = $1', [
            token,
          ]);
        } else {
          const store = readStore();
          if (store.sessions[token]) {
            delete store.sessions[token];
            writeStore(store);
          }
        }
      }
      res.json({ ok: true });
    })
  );

  // Admin unlock / lock
  app.post(
    '/api/auth/admin/unlock',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { adminPassword } = (req.body || {}) as { adminPassword?: string };
      const apartmentId = req.session!.apartmentId;
      const oldToken = req.session!.token;
      const isMaster = Boolean(req.session!.isMaster);
      const rawPw = adminPassword || '';
      const trimmedPw = rawPw.trim();

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const aptRes = await pool.query(
          'SELECT admin_password FROM apartments WHERE id = $1 LIMIT 1',
          [apartmentId]
        );
        const aptRow = aptRes.rows[0];
        const expectedPw = aptRow ? String(aptRow.admin_password) : '';
        if (
          !aptRow ||
          !trimmedPw ||
          (rawPw !== expectedPw && trimmedPw !== expectedPw.trim())
        ) {
          console.warn('[Auth] Admin unlock rejected (postgres):', {
            apartmentId,
            apartmentFound: Boolean(aptRow),
            passwordEmpty: !trimmedPw,
          });
          res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
          return;
        }
        const nextToken = createSignedToken(apartmentId, true, isMaster);
        const nowIso = new Date().toISOString();
        try {
          await pool.query('DELETE FROM sessions WHERE token = $1', [oldToken]);
          await pool.query(
            `INSERT INTO sessions (token, apartment_id, is_admin, is_master, created_at, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (token) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
            [nextToken, apartmentId, true, isMaster, nowIso, nowIso]
          );
        } catch (sessionErr) {
          console.warn(
            '[Auth] Admin session persistence warning (continuing with stateless token):',
            sessionErr instanceof Error ? sessionErr.message : String(sessionErr)
          );
        }
        res.json({ isAdmin: true, isMaster, token: nextToken });
        return;
      }

      const store = readStore();
      const apt = store.apartments.find((a) => a.id === apartmentId);
      if (
        !apt ||
        !trimmedPw ||
        (rawPw !== apt.adminPassword && trimmedPw !== apt.adminPassword.trim())
      ) {
        console.warn('[Auth] Admin unlock rejected (local/memory):', {
          apartmentId,
          apartmentFound: Boolean(apt),
          passwordEmpty: !trimmedPw,
        });
        res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
        return;
      }
      const nextToken = createSignedToken(apartmentId, true, isMaster);
      const nowIso = new Date().toISOString();
      delete store.sessions[oldToken];
      store.sessions[nextToken] = {
        token: nextToken,
        apartmentId,
        isAdmin: true,
        isMaster,
        createdAt: req.session!.createdAt || nowIso,
        lastSeenAt: nowIso,
      };
      writeStore(store);
      res.json({ isAdmin: true, isMaster, token: nextToken });
    })
  );

  app.post(
    '/api/auth/admin/lock',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const oldToken = req.session!.token;
      const apartmentId = req.session!.apartmentId;
      const isMaster = Boolean(req.session!.isMaster);
      const nextToken = createSignedToken(apartmentId, false, isMaster);
      const nowIso = new Date().toISOString();

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        try {
          await pool.query('DELETE FROM sessions WHERE token = $1', [oldToken]);
          await pool.query(
            `INSERT INTO sessions (token, apartment_id, is_admin, is_master, created_at, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (token) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
            [nextToken, apartmentId, false, isMaster, nowIso, nowIso]
          );
        } catch (sessionErr) {
          console.warn(
            '[Auth] Admin lock session persistence warning:',
            sessionErr instanceof Error ? sessionErr.message : String(sessionErr)
          );
        }
        res.json({ isAdmin: false, isMaster, token: nextToken });
        return;
      }
      const store = readStore();
      delete store.sessions[oldToken];
      store.sessions[nextToken] = {
        token: nextToken,
        apartmentId,
        isAdmin: false,
        isMaster,
        createdAt: req.session!.createdAt || nowIso,
        lastSeenAt: nowIso,
      };
      writeStore(store);
      res.json({ isAdmin: false, isMaster, token: nextToken });
    })
  );

  // Platform-wide Master Ad Control unlock
  app.post(
    '/api/auth/master/unlock',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { masterPassword } = (req.body || {}) as { masterPassword?: string };
      const expectedMaster =
        (process.env.MASTER_ADMIN_PASSWORD || '').trim() || 'master7777';
      const rawPw = masterPassword || '';
      const trimmedPw = rawPw.trim();

      if (
        !trimmedPw ||
        (rawPw !== expectedMaster && trimmedPw !== expectedMaster)
      ) {
        console.warn('[Auth] Master unlock rejected:', {
          apartmentId: req.session!.apartmentId,
          passwordEmpty: !trimmedPw,
          hasCustomMasterPassword:
            (process.env.MASTER_ADMIN_PASSWORD || '').trim().length > 0,
        });
        res
          .status(401)
          .json({ error: '통합 광고 마스터 비밀번호가 올바르지 않습니다.' });
        return;
      }

      const oldToken = req.session!.token;
      const apartmentId = req.session!.apartmentId;
      const nextToken = createSignedToken(apartmentId, true, true);
      const nowIso = new Date().toISOString();

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        try {
          await pool.query('DELETE FROM sessions WHERE token = $1', [oldToken]);
          await pool.query(
            `INSERT INTO sessions (token, apartment_id, is_admin, is_master, created_at, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (token) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
            [nextToken, apartmentId, true, true, nowIso, nowIso]
          );
        } catch (sessionErr) {
          console.warn(
            '[Auth] Master session persistence warning:',
            sessionErr instanceof Error ? sessionErr.message : String(sessionErr)
          );
        }
      } else {
        const store = readStore();
        delete store.sessions[oldToken];
        store.sessions[nextToken] = {
          token: nextToken,
          apartmentId,
          isAdmin: true,
          isMaster: true,
          createdAt: req.session!.createdAt || nowIso,
          lastSeenAt: nowIso,
        };
        writeStore(store);
      }

      res.json({ isMaster: true, token: nextToken });
    })
  );

  // Workers
  app.get(
    '/api/workers',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          'SELECT * FROM workers WHERE apartment_id = $1 ORDER BY created_at ASC',
          [apartmentId]
        );
        res.json({ workers: result.rows.map(mapWorkerRow) });
        return;
      }
      const store = readStore();
      res.json({
        workers: store.workers.filter((w) => w.apartmentId === apartmentId),
      });
    })
  );

  app.post(
    '/api/workers',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { name, role } = req.body as { name?: string; role?: string };
      const apartmentId = req.session!.apartmentId;
      const trimmedName = (name || '').trim();
      const trimmedRole = (role || '').trim() || '직원';

      if (!trimmedName) {
        res.status(400).json({ error: '직원 이름을 입력해 주세요.' });
        return;
      }
      if (trimmedName.length > 20) {
        res
          .status(400)
          .json({ error: '직원 이름은 20자 이내로 입력해 주세요.' });
        return;
      }

      const newWorker: WorkerRecord = {
        id: `w-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        apartmentId,
        name: trimmedName,
        role: trimmedRole,
        createdAt: new Date().toISOString(),
      };

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const dup = await pool.query(
          'SELECT 1 FROM workers WHERE apartment_id = $1 AND name = $2 LIMIT 1',
          [apartmentId, trimmedName]
        );
        if (dup.rows.length > 0) {
          res.status(409).json({ error: '이미 등록된 직원 이름입니다.' });
          return;
        }
        await pool.query(
          `INSERT INTO workers (id, apartment_id, name, role, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            newWorker.id,
            newWorker.apartmentId,
            newWorker.name,
            newWorker.role,
            newWorker.createdAt,
          ]
        );
        res.status(201).json({ worker: newWorker });
        return;
      }

      const store = readStore();
      if (
        store.workers.some(
          (w) => w.apartmentId === apartmentId && w.name === trimmedName
        )
      ) {
        res.status(409).json({ error: '이미 등록된 직원 이름입니다.' });
        return;
      }

      store.workers.push(newWorker);
      writeStore(store);
      res.status(201).json({ worker: newWorker });
    })
  );

  app.delete(
    '/api/workers/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          'DELETE FROM workers WHERE id = $1 AND apartment_id = $2 RETURNING id',
          [id, apartmentId]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: '해당 직원을 찾을 수 없습니다.' });
          return;
        }
        res.json({ ok: true });
        return;
      }

      const store = readStore();
      const exists = store.workers.some(
        (w) => w.id === id && w.apartmentId === apartmentId
      );
      if (!exists) {
        res.status(404).json({ error: '해당 직원을 찾을 수 없습니다.' });
        return;
      }
      store.workers = store.workers.filter(
        (w) => !(w.id === id && w.apartmentId === apartmentId)
      );
      writeStore(store);
      res.json({ ok: true });
    })
  );

  // Work Logs
  app.get(
    '/api/logs',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const query = req.query as {
        workerId?: string;
        date?: string;
        q?: string;
        status?: string;
      };
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          'SELECT * FROM work_logs WHERE apartment_id = $1 ORDER BY work_date DESC, created_at DESC',
          [apartmentId]
        );
        const logs = filterAndSortLogs(result.rows.map(mapLogRow), query);
        res.json({ logs });
        return;
      }

      const store = readStore();
      const logs = filterAndSortLogs(
        store.logs.filter((l) => l.apartmentId === apartmentId),
        query
      );
      res.json({ logs });
    })
  );

  app.post(
    '/api/logs',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { workerId, workDate, location, content, status, photoBase64 } =
        req.body as {
          workerId?: string;
          workDate?: string;
          location?: string;
          content?: string;
          status?: WorkStatus;
          photoBase64?: string | null;
        };

      const apartmentId = req.session!.apartmentId;
      let worker: WorkerRecord | undefined;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const wRes = await getPgPool().query(
          'SELECT * FROM workers WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [workerId || '', apartmentId]
        );
        worker = wRes.rows[0] ? mapWorkerRow(wRes.rows[0]) : undefined;
      } else {
        const store = readStore();
        worker = store.workers.find(
          (w) => w.id === workerId && w.apartmentId === apartmentId
        );
      }

      if (!worker) {
        res.status(400).json({
          error: '목록에서 작업자(직원 이름)를 먼저 선택해 주세요.',
        });
        return;
      }

      const cleanDate = (workDate || '').trim();
      const cleanLocation = (location || '').trim();
      const cleanContent = (content || '').trim();
      const cleanStatus: WorkStatus =
        status === 'pending' ||
        status === 'in_progress' ||
        status === 'completed'
          ? status
          : 'completed';

      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        res.status(400).json({ error: '올바른 작업 날짜를 선택해 주세요.' });
        return;
      }
      if (!cleanLocation) {
        res.status(400).json({ error: '작업 장소를 입력해 주세요.' });
        return;
      }
      if (!cleanContent) {
        res.status(400).json({ error: '처리 내용을 입력해 주세요.' });
        return;
      }

      let photoUrl: string | null = null;
      if (photoBase64 && typeof photoBase64 === 'string') {
        try {
          photoUrl = saveBase64Photo(photoBase64);
        } catch (err) {
          res.status(400).json({
            error:
              err instanceof Error
                ? err.message
                : '사진 업로드에 실패했습니다.',
          });
          return;
        }
      }

      const nowIso = new Date().toISOString();
      const newLog: WorkLogRecord = {
        id: `log-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        apartmentId,
        workerId: worker.id,
        workerName: worker.name,
        workerRole: worker.role,
        workDate: cleanDate,
        location: cleanLocation,
        content: cleanContent,
        status: cleanStatus,
        photoUrl,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (USE_POSTGRES) {
        await getPgPool().query(
          `INSERT INTO work_logs (id, apartment_id, worker_id, worker_name, worker_role, work_date, location, content, status, photo_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            newLog.id,
            newLog.apartmentId,
            newLog.workerId,
            newLog.workerName,
            newLog.workerRole,
            newLog.workDate,
            newLog.location,
            newLog.content,
            newLog.status,
            newLog.photoUrl,
            newLog.createdAt,
            newLog.updatedAt,
          ]
        );
      } else {
        const store = readStore();
        store.logs.unshift(newLog);
        writeStore(store);
      }

      res.status(201).json({ log: newLog });
    })
  );

  app.patch(
    '/api/logs/:id',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;
      const {
        actingWorkerId,
        workDate,
        location,
        content,
        status,
        photoBase64,
        removePhoto,
      } = req.body as {
        actingWorkerId?: string;
        workDate?: string;
        location?: string;
        content?: string;
        status?: WorkStatus;
        photoBase64?: string | null;
        removePhoto?: boolean;
      };

      let existing: WorkLogRecord | undefined;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const found = await getPgPool().query(
          'SELECT * FROM work_logs WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [id, apartmentId]
        );
        existing = found.rows[0] ? mapLogRow(found.rows[0]) : undefined;
      } else {
        const store = readStore();
        existing = store.logs.find(
          (l) => l.id === id && l.apartmentId === apartmentId
        );
      }

      if (!existing) {
        res.status(404).json({ error: '해당 작업일지를 찾을 수 없습니다.' });
        return;
      }

      const isAdmin = Boolean(req.session?.isAdmin);
      const isOwner = Boolean(
        actingWorkerId && existing.workerId === actingWorkerId
      );

      if (!isAdmin && !isOwner) {
        res.status(403).json({
          error:
            '본인이 작성한 작업일지만 수정할 수 있습니다. 타인의 기록 수정은 관리자 인증이 필요합니다.',
        });
        return;
      }

      const cleanDate = (workDate ?? existing.workDate).trim();
      const cleanLocation = (location ?? existing.location).trim();
      const cleanContent = (content ?? existing.content).trim();
      const cleanStatus: WorkStatus =
        status === 'pending' ||
        status === 'in_progress' ||
        status === 'completed'
          ? status
          : existing.status || 'completed';

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) ||
        !cleanLocation ||
        !cleanContent
      ) {
        res.status(400).json({
          error: '작업 날짜, 작업 장소, 처리 내용을 모두 입력해 주세요.',
        });
        return;
      }

      let nextPhotoUrl = existing.photoUrl;
      if (removePhoto) {
        deleteUploadedPhotoIfLocal(existing.photoUrl);
        nextPhotoUrl = null;
      } else if (photoBase64 && typeof photoBase64 === 'string') {
        try {
          const saved = saveBase64Photo(photoBase64);
          if (saved) {
            deleteUploadedPhotoIfLocal(existing.photoUrl);
            nextPhotoUrl = saved;
          }
        } catch (err) {
          res.status(400).json({
            error:
              err instanceof Error
                ? err.message
                : '사진 업로드에 실패했습니다.',
          });
          return;
        }
      }

      const updated: WorkLogRecord = {
        ...existing,
        workDate: cleanDate,
        location: cleanLocation,
        content: cleanContent,
        status: cleanStatus,
        photoUrl: nextPhotoUrl,
        updatedAt: new Date().toISOString(),
      };

      if (USE_POSTGRES) {
        await getPgPool().query(
          `UPDATE work_logs
           SET work_date = $1, location = $2, content = $3, status = $4, photo_url = $5, updated_at = $6
           WHERE id = $7 AND apartment_id = $8`,
          [
            updated.workDate,
            updated.location,
            updated.content,
            updated.status,
            updated.photoUrl,
            updated.updatedAt,
            id,
            apartmentId,
          ]
        );
      } else {
        const store = readStore();
        const idx = store.logs.findIndex(
          (l) => l.id === id && l.apartmentId === apartmentId
        );
        if (idx !== -1) {
          store.logs[idx] = updated;
          writeStore(store);
        }
      }

      res.json({ log: updated });
    })
  );

  app.delete(
    '/api/logs/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const delRes = await getPgPool().query(
          'DELETE FROM work_logs WHERE id = $1 AND apartment_id = $2 RETURNING photo_url',
          [id, apartmentId]
        );
        if (delRes.rows.length === 0) {
          res.status(404).json({ error: '해당 작업일지를 찾을 수 없습니다.' });
          return;
        }
        deleteUploadedPhotoIfLocal(
          delRes.rows[0].photo_url ? String(delRes.rows[0].photo_url) : null
        );
        res.json({ ok: true });
        return;
      }

      const store = readStore();
      const target = store.logs.find(
        (l) => l.id === id && l.apartmentId === apartmentId
      );
      if (!target) {
        res.status(404).json({ error: '해당 작업일지를 찾을 수 없습니다.' });
        return;
      }
      deleteUploadedPhotoIfLocal(target.photoUrl);
      store.logs = store.logs.filter(
        (l) => !(l.id === id && l.apartmentId === apartmentId)
      );
      writeStore(store);
      res.json({ ok: true });
    })
  );

  // Notices
  app.get(
    '/api/notices',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          'SELECT * FROM notices WHERE apartment_id = $1 ORDER BY is_pinned DESC, created_at DESC',
          [apartmentId]
        );
        res.json({ notices: result.rows.map(mapNoticeRow) });
        return;
      }

      const store = readStore();
      const notices = store.notices
        .filter((n) => n.apartmentId === apartmentId)
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) {
            return a.isPinned ? -1 : 1;
          }
          return b.createdAt.localeCompare(a.createdAt);
        });
      res.json({ notices });
    })
  );

  app.post(
    '/api/notices',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { title, content, isPinned, authorName } = req.body as {
        title?: string;
        content?: string;
        isPinned?: boolean;
        authorName?: string;
      };
      const cleanTitle = (title || '').trim();
      const cleanContent = (content || '').trim();
      if (!cleanTitle || !cleanContent) {
        res
          .status(400)
          .json({ error: '공지 제목과 내용을 모두 입력해 주세요.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const notice: NoticeRecord = {
        id: `notice-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        apartmentId: req.session!.apartmentId,
        title: cleanTitle,
        content: cleanContent,
        isPinned: Boolean(isPinned),
        authorName: (authorName || '').trim() || '관리사무소',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (USE_POSTGRES) {
        await ensurePgReady();
        await getPgPool().query(
          `INSERT INTO notices (id, apartment_id, title, content, is_pinned, author_name, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            notice.id,
            notice.apartmentId,
            notice.title,
            notice.content,
            notice.isPinned,
            notice.authorName,
            notice.createdAt,
            notice.updatedAt,
          ]
        );
      } else {
        const store = readStore();
        store.notices.unshift(notice);
        writeStore(store);
      }

      res.status(201).json({ notice });
    })
  );

  app.patch(
    '/api/notices/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;
      const { title, content, isPinned } = req.body as {
        title?: string;
        content?: string;
        isPinned?: boolean;
      };

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const found = await pool.query(
          'SELECT * FROM notices WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [id, apartmentId]
        );
        if (found.rows.length === 0) {
          res.status(404).json({ error: '해당 공지사항을 찾을 수 없습니다.' });
          return;
        }
        const existing = mapNoticeRow(found.rows[0]);
        const cleanTitle = (title ?? existing.title).trim();
        const cleanContent = (content ?? existing.content).trim();
        if (!cleanTitle || !cleanContent) {
          res
            .status(400)
            .json({ error: '공지 제목과 내용을 모두 입력해 주세요.' });
          return;
        }
        const updated: NoticeRecord = {
          ...existing,
          title: cleanTitle,
          content: cleanContent,
          isPinned: typeof isPinned === 'boolean' ? isPinned : existing.isPinned,
          updatedAt: new Date().toISOString(),
        };
        await pool.query(
          'UPDATE notices SET title = $1, content = $2, is_pinned = $3, updated_at = $4 WHERE id = $5 AND apartment_id = $6',
          [
            updated.title,
            updated.content,
            updated.isPinned,
            updated.updatedAt,
            id,
            apartmentId,
          ]
        );
        res.json({ notice: updated });
        return;
      }

      const store = readStore();
      const idx = store.notices.findIndex(
        (n) => n.id === id && n.apartmentId === apartmentId
      );
      if (idx === -1) {
        res.status(404).json({ error: '해당 공지사항을 찾을 수 없습니다.' });
        return;
      }

      const existing = store.notices[idx];
      const cleanTitle = (title ?? existing.title).trim();
      const cleanContent = (content ?? existing.content).trim();
      if (!cleanTitle || !cleanContent) {
        res
          .status(400)
          .json({ error: '공지 제목과 내용을 모두 입력해 주세요.' });
        return;
      }

      const updated: NoticeRecord = {
        ...existing,
        title: cleanTitle,
        content: cleanContent,
        isPinned: typeof isPinned === 'boolean' ? isPinned : existing.isPinned,
        updatedAt: new Date().toISOString(),
      };
      store.notices[idx] = updated;
      writeStore(store);
      res.json({ notice: updated });
    })
  );

  app.delete(
    '/api/notices/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const del = await getPgPool().query(
          'DELETE FROM notices WHERE id = $1 AND apartment_id = $2 RETURNING id',
          [id, apartmentId]
        );
        if (del.rows.length === 0) {
          res.status(404).json({ error: '해당 공지사항을 찾을 수 없습니다.' });
          return;
        }
        res.json({ ok: true });
        return;
      }

      const store = readStore();
      if (
        !store.notices.some((n) => n.id === id && n.apartmentId === apartmentId)
      ) {
        res.status(404).json({ error: '해당 공지사항을 찾을 수 없습니다.' });
        return;
      }
      store.notices = store.notices.filter(
        (n) => !(n.id === id && n.apartmentId === apartmentId)
      );
      writeStore(store);
      res.json({ ok: true });
    })
  );

  // Handovers
  app.get(
    '/api/handovers',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          `SELECT * FROM handovers WHERE apartment_id = $1
           ORDER BY (CASE WHEN status = 'pending' THEN 0 ELSE 1 END) ASC, created_at DESC`,
          [apartmentId]
        );
        res.json({ handovers: result.rows.map(mapHandoverRow) });
        return;
      }

      const store = readStore();
      const handovers = store.handovers
        .filter((h) => h.apartmentId === apartmentId)
        .sort((a, b) => {
          if (a.status !== b.status) {
            return a.status === 'pending' ? -1 : 1;
          }
          return b.createdAt.localeCompare(a.createdAt);
        });
      res.json({ handovers });
    })
  );

  app.post(
    '/api/handovers',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { workerId, targetShift, content } = req.body as {
        workerId?: string;
        targetShift?: string;
        content?: string;
      };
      const apartmentId = req.session!.apartmentId;

      let worker: WorkerRecord | undefined;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const wRes = await getPgPool().query(
          'SELECT * FROM workers WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [workerId || '', apartmentId]
        );
        worker = wRes.rows[0] ? mapWorkerRow(wRes.rows[0]) : undefined;
      } else {
        const store = readStore();
        worker = store.workers.find(
          (w) => w.id === workerId && w.apartmentId === apartmentId
        );
      }

      if (!worker) {
        res
          .status(400)
          .json({ error: '작성자(직원 이름)를 먼저 선택해 주세요.' });
        return;
      }
      const cleanContent = (content || '').trim();
      const cleanShift = (targetShift || '').trim() || '주간/익일';
      if (!cleanContent) {
        res.status(400).json({ error: '인수인계 내용을 입력해 주세요.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const handover: HandoverRecord = {
        id: `handover-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        apartmentId,
        workerId: worker.id,
        workerName: worker.name,
        workerRole: worker.role,
        targetShift: cleanShift,
        content: cleanContent,
        status: 'pending',
        completedBy: null,
        completedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (USE_POSTGRES) {
        await getPgPool().query(
          `INSERT INTO handovers (id, apartment_id, worker_id, worker_name, worker_role, target_shift, content, status, completed_by, completed_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            handover.id,
            handover.apartmentId,
            handover.workerId,
            handover.workerName,
            handover.workerRole,
            handover.targetShift,
            handover.content,
            handover.status,
            handover.completedBy,
            handover.completedAt,
            handover.createdAt,
            handover.updatedAt,
          ]
        );
      } else {
        const store = readStore();
        store.handovers.unshift(handover);
        writeStore(store);
      }

      res.status(201).json({ handover });
    })
  );

  app.patch(
    '/api/handovers/:id/status',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;
      const { status, actingWorkerId } = req.body as {
        status?: 'pending' | 'completed';
        actingWorkerId?: string;
      };

      let existing: HandoverRecord | undefined;
      let actorName = '';

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const found = await pool.query(
          'SELECT * FROM handovers WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [id, apartmentId]
        );
        existing = found.rows[0] ? mapHandoverRow(found.rows[0]) : undefined;
        if (existing) {
          const wRes = await pool.query(
            'SELECT name FROM workers WHERE id = $1 AND apartment_id = $2 LIMIT 1',
            [actingWorkerId || '', apartmentId]
          );
          actorName = wRes.rows[0]
            ? String(wRes.rows[0].name)
            : req.session?.isAdmin
              ? '관리자'
              : '';
        }
      } else {
        const store = readStore();
        existing = store.handovers.find(
          (h) => h.id === id && h.apartmentId === apartmentId
        );
        if (existing) {
          const worker = store.workers.find(
            (w) => w.id === actingWorkerId && w.apartmentId === apartmentId
          );
          actorName = worker?.name || (req.session?.isAdmin ? '관리자' : '');
        }
      }

      if (!existing) {
        res
          .status(404)
          .json({ error: '해당 인수인계 항목을 찾을 수 없습니다.' });
        return;
      }
      if (!actorName) {
        res.status(400).json({
          error: '인계 확인을 하려면 먼저 작업자 이름을 선택해 주세요.',
        });
        return;
      }

      const nextStatus = status === 'completed' ? 'completed' : 'pending';
      const nowIso = new Date().toISOString();
      const updated: HandoverRecord = {
        ...existing,
        status: nextStatus,
        completedBy: nextStatus === 'completed' ? actorName : null,
        completedAt: nextStatus === 'completed' ? nowIso : null,
        updatedAt: nowIso,
      };

      if (USE_POSTGRES) {
        await getPgPool().query(
          'UPDATE handovers SET status = $1, completed_by = $2, completed_at = $3, updated_at = $4 WHERE id = $5 AND apartment_id = $6',
          [
            updated.status,
            updated.completedBy,
            updated.completedAt,
            updated.updatedAt,
            id,
            apartmentId,
          ]
        );
      } else {
        const store = readStore();
        const idx = store.handovers.findIndex(
          (h) => h.id === id && h.apartmentId === apartmentId
        );
        if (idx !== -1) {
          store.handovers[idx] = updated;
          writeStore(store);
        }
      }

      res.json({ handover: updated });
    })
  );

  app.patch(
    '/api/handovers/:id',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;
      const { actingWorkerId, targetShift, content } = req.body as {
        actingWorkerId?: string;
        targetShift?: string;
        content?: string;
      };

      let existing: HandoverRecord | undefined;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const found = await getPgPool().query(
          'SELECT * FROM handovers WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [id, apartmentId]
        );
        existing = found.rows[0] ? mapHandoverRow(found.rows[0]) : undefined;
      } else {
        const store = readStore();
        existing = store.handovers.find(
          (h) => h.id === id && h.apartmentId === apartmentId
        );
      }

      if (!existing) {
        res
          .status(404)
          .json({ error: '해당 인수인계 항목을 찾을 수 없습니다.' });
        return;
      }

      const isAdmin = Boolean(req.session?.isAdmin);
      const isOwner = Boolean(
        actingWorkerId && existing.workerId === actingWorkerId
      );
      if (!isAdmin && !isOwner) {
        res
          .status(403)
          .json({ error: '본인이 작성한 인수인계만 수정할 수 있습니다.' });
        return;
      }

      const cleanContent = (content ?? existing.content).trim();
      const cleanShift =
        (targetShift ?? existing.targetShift).trim() || existing.targetShift;
      if (!cleanContent) {
        res.status(400).json({ error: '인수인계 내용을 입력해 주세요.' });
        return;
      }

      const updated: HandoverRecord = {
        ...existing,
        targetShift: cleanShift,
        content: cleanContent,
        updatedAt: new Date().toISOString(),
      };

      if (USE_POSTGRES) {
        await getPgPool().query(
          'UPDATE handovers SET target_shift = $1, content = $2, updated_at = $3 WHERE id = $4 AND apartment_id = $5',
          [
            updated.targetShift,
            updated.content,
            updated.updatedAt,
            id,
            apartmentId,
          ]
        );
      } else {
        const store = readStore();
        const idx = store.handovers.findIndex(
          (h) => h.id === id && h.apartmentId === apartmentId
        );
        if (idx !== -1) {
          store.handovers[idx] = updated;
          writeStore(store);
        }
      }

      res.json({ handover: updated });
    })
  );

  app.delete(
    '/api/handovers/:id',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;
      const { actingWorkerId } = req.body as { actingWorkerId?: string };

      let existing: HandoverRecord | undefined;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const found = await getPgPool().query(
          'SELECT * FROM handovers WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [id, apartmentId]
        );
        existing = found.rows[0] ? mapHandoverRow(found.rows[0]) : undefined;
      } else {
        const store = readStore();
        existing = store.handovers.find(
          (h) => h.id === id && h.apartmentId === apartmentId
        );
      }

      if (!existing) {
        res
          .status(404)
          .json({ error: '해당 인수인계 항목을 찾을 수 없습니다.' });
        return;
      }
      const isAdmin = Boolean(req.session?.isAdmin);
      const isOwner = Boolean(
        actingWorkerId && existing.workerId === actingWorkerId
      );
      if (!isAdmin && !isOwner) {
        res
          .status(403)
          .json({ error: '본인이 작성한 인수인계만 삭제할 수 있습니다.' });
        return;
      }

      if (USE_POSTGRES) {
        await getPgPool().query(
          'DELETE FROM handovers WHERE id = $1 AND apartment_id = $2',
          [id, apartmentId]
        );
      } else {
        const store = readStore();
        store.handovers = store.handovers.filter(
          (h) => !(h.id === id && h.apartmentId === apartmentId)
        );
        writeStore(store);
      }
      res.json({ ok: true });
    })
  );

  // Event Banners
  app.get(
    '/api/banners',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const result = await getPgPool().query(
          'SELECT * FROM event_banners WHERE apartment_id = $1 ORDER BY is_active DESC, updated_at DESC',
          [apartmentId]
        );
        res.json({ banners: result.rows.map(mapBannerRow) });
        return;
      }

      const store = readStore();
      const banners = (store.banners || [])
        .filter((b) => b.apartmentId === apartmentId)
        .sort((a, b) => {
          if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
          }
          return b.updatedAt.localeCompare(a.updatedAt);
        });
      res.json({ banners });
    })
  );

  app.post(
    '/api/banners',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const {
        category,
        title,
        subtitle,
        eventDate,
        eventLocation,
        contactInfo,
        isActive,
      } = req.body as {
        category?: BannerCategory;
        title?: string;
        subtitle?: string;
        eventDate?: string;
        eventLocation?: string;
        contactInfo?: string;
        isActive?: boolean;
      };

      const cleanTitle = (title || '').trim();
      if (!cleanTitle) {
        res.status(400).json({ error: '배너 제목을 입력해 주세요.' });
        return;
      }

      const validCategories: BannerCategory[] = [
        'wedding',
        'funeral',
        'celebration',
        'notice',
      ];
      const cleanCategory: BannerCategory = validCategories.includes(
        category as BannerCategory
      )
        ? (category as BannerCategory)
        : 'notice';

      const nowIso = new Date().toISOString();
      const banner: EventBannerRecord = {
        id: `banner-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
        apartmentId: req.session!.apartmentId,
        category: cleanCategory,
        title: cleanTitle.slice(0, 80),
        subtitle: (subtitle || '').trim().slice(0, 120),
        eventDate: (eventDate || '').trim().slice(0, 60),
        eventLocation: (eventLocation || '').trim().slice(0, 80),
        contactInfo: (contactInfo || '').trim().slice(0, 80),
        isActive: isActive !== false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (USE_POSTGRES) {
        await ensurePgReady();
        await getPgPool().query(
          `INSERT INTO event_banners (id, apartment_id, category, title, subtitle, event_date, event_location, contact_info, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            banner.id,
            banner.apartmentId,
            banner.category,
            banner.title,
            banner.subtitle,
            banner.eventDate,
            banner.eventLocation,
            banner.contactInfo,
            banner.isActive,
            banner.createdAt,
            banner.updatedAt,
          ]
        );
      } else {
        const store = readStore();
        if (!Array.isArray(store.banners)) store.banners = [];
        store.banners.unshift(banner);
        writeStore(store);
      }

      res.status(201).json({ banner });
    })
  );

  app.patch(
    '/api/banners/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;
      const {
        category,
        title,
        subtitle,
        eventDate,
        eventLocation,
        contactInfo,
        isActive,
      } = req.body as {
        category?: BannerCategory;
        title?: string;
        subtitle?: string;
        eventDate?: string;
        eventLocation?: string;
        contactInfo?: string;
        isActive?: boolean;
      };

      let existing: EventBannerRecord | undefined;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const found = await getPgPool().query(
          'SELECT * FROM event_banners WHERE id = $1 AND apartment_id = $2 LIMIT 1',
          [id, apartmentId]
        );
        existing = found.rows[0] ? mapBannerRow(found.rows[0]) : undefined;
      } else {
        const store = readStore();
        existing = (store.banners || []).find(
          (b) => b.id === id && b.apartmentId === apartmentId
        );
      }

      if (!existing) {
        res.status(404).json({ error: '해당 배너를 찾을 수 없습니다.' });
        return;
      }

      const cleanTitle = (title ?? existing.title).trim();
      if (!cleanTitle) {
        res.status(400).json({ error: '배너 제목을 입력해 주세요.' });
        return;
      }

      const validCategories: BannerCategory[] = [
        'wedding',
        'funeral',
        'celebration',
        'notice',
      ];
      const cleanCategory: BannerCategory =
        category && validCategories.includes(category)
          ? category
          : existing.category;

      const updated: EventBannerRecord = {
        ...existing,
        category: cleanCategory,
        title: cleanTitle.slice(0, 80),
        subtitle: (subtitle ?? existing.subtitle).trim().slice(0, 120),
        eventDate: (eventDate ?? existing.eventDate).trim().slice(0, 60),
        eventLocation: (eventLocation ?? existing.eventLocation)
          .trim()
          .slice(0, 80),
        contactInfo: (contactInfo ?? existing.contactInfo).trim().slice(0, 80),
        isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
        updatedAt: new Date().toISOString(),
      };

      if (USE_POSTGRES) {
        await getPgPool().query(
          `UPDATE event_banners
           SET category = $1, title = $2, subtitle = $3, event_date = $4, event_location = $5, contact_info = $6, is_active = $7, updated_at = $8
           WHERE id = $9 AND apartment_id = $10`,
          [
            updated.category,
            updated.title,
            updated.subtitle,
            updated.eventDate,
            updated.eventLocation,
            updated.contactInfo,
            updated.isActive,
            updated.updatedAt,
            id,
            apartmentId,
          ]
        );
      } else {
        const store = readStore();
        if (!Array.isArray(store.banners)) store.banners = [];
        const idx = store.banners.findIndex(
          (b) => b.id === id && b.apartmentId === apartmentId
        );
        if (idx !== -1) {
          store.banners[idx] = updated;
          writeStore(store);
        }
      }

      res.json({ banner: updated });
    })
  );

  app.delete(
    '/api/banners/:id',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const del = await getPgPool().query(
          'DELETE FROM event_banners WHERE id = $1 AND apartment_id = $2 RETURNING id',
          [id, apartmentId]
        );
        if (del.rows.length === 0) {
          res.status(404).json({ error: '해당 배너를 찾을 수 없습니다.' });
          return;
        }
        res.json({ ok: true });
        return;
      }

      const store = readStore();
      if (!Array.isArray(store.banners)) store.banners = [];
      if (
        !store.banners.some((b) => b.id === id && b.apartmentId === apartmentId)
      ) {
        res.status(404).json({ error: '해당 배너를 찾을 수 없습니다.' });
        return;
      }

      store.banners = store.banners.filter(
        (b) => !(b.id === id && b.apartmentId === apartmentId)
      );
      writeStore(store);
      res.json({ ok: true });
    })
  );

  function validateAndBuildAdRecord(
    targetApartmentId: string,
    body: {
      mode?: AdSlotMode;
      sponsorName?: string;
      headline?: string;
      description?: string;
      imageUrl?: string;
      imageBase64?: string | null;
      linkUrl?: string;
      ctaLabel?: string;
      contactInfo?: string;
      adsenseClientId?: string;
      adsenseSlotId?: string;
      adfitUnitId?: string;
    }
  ): { record?: ExternalAdRecord; error?: string } {
    const validModes: AdSlotMode[] = [
      'inquiry',
      'custom',
      'adsense',
      'adfit',
      'hidden',
    ];
    const cleanMode: AdSlotMode =
      body.mode && validModes.includes(body.mode) ? body.mode : 'inquiry';

    const rawLink = (body.linkUrl || '').trim();
    const safeLink = sanitizeExternalHttpUrl(rawLink);
    if (rawLink && !safeLink) {
      return {
        error: '연결 링크 URL은 http:// 또는 https://로 시작해야 합니다.',
      };
    }

    let resolvedImageUrl = '';
    if (body.imageBase64) {
      try {
        resolvedImageUrl = saveBase64Photo(body.imageBase64) || '';
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : '광고 이미지를 처리하는 중 오류가 발생했습니다.',
        };
      }
    } else if (body.imageUrl) {
      const trimmedImg = body.imageUrl.trim();
      if (
        trimmedImg.startsWith('/api/uploads/') ||
        trimmedImg.startsWith('/src/assets/') ||
        /^https?:\/\//i.test(trimmedImg) ||
        /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmedImg)
      ) {
        resolvedImageUrl = trimmedImg;
      } else {
        return {
          error:
            '이미지 URL은 http(s):// 주소이거나 업로드된 이미지여야 합니다.',
        };
      }
    }

    const cleanHeadline = (body.headline || '').trim().slice(0, 80);
    const cleanAdsenseClient = (body.adsenseClientId || '').trim().slice(0, 40);
    const cleanAdsenseSlot = (body.adsenseSlotId || '').trim().slice(0, 40);
    const cleanAdfitUnit = (body.adfitUnitId || '').trim().slice(0, 40);

    if (cleanMode === 'custom' && !cleanHeadline && !resolvedImageUrl) {
      return {
        error: '직접 배너 모드에서는 광고 제목 또는 배너 이미지를 입력해 주세요.',
      };
    }
    if (cleanMode === 'adsense' && (!cleanAdsenseClient || !cleanAdsenseSlot)) {
      return {
        error:
          'Google AdSense 클라이언트 ID(ca-pub-...)와 슬롯 ID를 모두 입력해 주세요.',
      };
    }
    if (cleanMode === 'adfit' && !cleanAdfitUnit) {
      return {
        error: '카카오 애드핏 광고 단위 ID(DAN-...)를 입력해 주세요.',
      };
    }

    return {
      record: {
        apartmentId: targetApartmentId,
        mode: cleanMode,
        sponsorName: (body.sponsorName || '').trim().slice(0, 40),
        headline: cleanHeadline,
        description: (body.description || '').trim().slice(0, 160),
        imageUrl: resolvedImageUrl,
        linkUrl: safeLink,
        ctaLabel: (body.ctaLabel || '').trim().slice(0, 24) || '자세히 보기',
        contactInfo: (body.contactInfo || '').trim().slice(0, 80),
        adsenseClientId: cleanAdsenseClient,
        adsenseSlotId: cleanAdsenseSlot,
        adfitUnitId: cleanAdfitUnit,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // External Bottom Ad Slot (supports Global Shared Ad + Apartment Override)
  app.get(
    '/api/ad-slot',
    requireAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;
      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const [aptFound, globalFound] = await Promise.all([
          pool.query('SELECT * FROM external_ads WHERE apartment_id = $1 LIMIT 1', [
            apartmentId,
          ]),
          pool.query('SELECT * FROM global_ad_slot WHERE id = $1 LIMIT 1', [
            'default',
          ]),
        ]);
        const globalAdSlot = globalFound.rows[0]
          ? mapExternalAdRow({
              ...globalFound.rows[0],
              apartment_id: '__global__',
            })
          : createDefaultExternalAd('__global__');
        const hasApartmentOverride = aptFound.rows.length > 0;
        const adSlot = hasApartmentOverride
          ? mapExternalAdRow(aptFound.rows[0])
          : { ...globalAdSlot, apartmentId };
        res.json({ adSlot, globalAdSlot, hasApartmentOverride });
        return;
      }

      const store = readStore();
      const globalAdSlot =
        store.globalAd || createDefaultExternalAd('__global__');
      const aptOverride = store.externalAds?.[apartmentId];
      const hasApartmentOverride = Boolean(aptOverride);
      const adSlot = aptOverride || { ...globalAdSlot, apartmentId };
      res.json({ adSlot, globalAdSlot, hasApartmentOverride });
    })
  );

  app.put(
    '/api/ad-slot',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;
      const { record, error } = validateAndBuildAdRecord(
        apartmentId,
        req.body as Parameters<typeof validateAndBuildAdRecord>[1]
      );
      if (error || !record) {
        res.status(400).json({ error: error || '광고 설정이 올바르지 않습니다.' });
        return;
      }

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        await pool.query(
          `INSERT INTO external_ads (
            apartment_id, mode, sponsor_name, headline, description, image_url, link_url,
            cta_label, contact_info, adsense_client_id, adsense_slot_id, adfit_unit_id, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (apartment_id) DO UPDATE SET
            mode = EXCLUDED.mode,
            sponsor_name = EXCLUDED.sponsor_name,
            headline = EXCLUDED.headline,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            link_url = EXCLUDED.link_url,
            cta_label = EXCLUDED.cta_label,
            contact_info = EXCLUDED.contact_info,
            adsense_client_id = EXCLUDED.adsense_client_id,
            adsense_slot_id = EXCLUDED.adsense_slot_id,
            adfit_unit_id = EXCLUDED.adfit_unit_id,
            updated_at = EXCLUDED.updated_at`,
          [
            record.apartmentId,
            record.mode,
            record.sponsorName,
            record.headline,
            record.description,
            record.imageUrl,
            record.linkUrl,
            record.ctaLabel,
            record.contactInfo,
            record.adsenseClientId,
            record.adsenseSlotId,
            record.adfitUnitId,
            record.updatedAt,
          ]
        );
        const globalFound = await pool.query(
          'SELECT * FROM global_ad_slot WHERE id = $1 LIMIT 1',
          ['default']
        );
        const globalAdSlot = globalFound.rows[0]
          ? mapExternalAdRow({
              ...globalFound.rows[0],
              apartment_id: '__global__',
            })
          : createDefaultExternalAd('__global__');
        res.json({
          adSlot: record,
          globalAdSlot,
          hasApartmentOverride: true,
        });
        return;
      }

      const store = readStore();
      if (!store.externalAds || typeof store.externalAds !== 'object') {
        store.externalAds = {};
      }
      const prevImg = store.externalAds[apartmentId]?.imageUrl;
      if (prevImg && prevImg !== record.imageUrl) {
        deleteUploadedPhotoIfLocal(prevImg);
      }
      store.externalAds[apartmentId] = record;
      writeStore(store);

      const globalAdSlot =
        store.globalAd || createDefaultExternalAd('__global__');
      res.json({ adSlot: record, globalAdSlot, hasApartmentOverride: true });
    })
  );

  app.delete(
    '/api/ad-slot/override',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const apartmentId = req.session!.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        await pool.query('DELETE FROM external_ads WHERE apartment_id = $1', [
          apartmentId,
        ]);
        const globalFound = await pool.query(
          'SELECT * FROM global_ad_slot WHERE id = $1 LIMIT 1',
          ['default']
        );
        const globalAdSlot = globalFound.rows[0]
          ? mapExternalAdRow({
              ...globalFound.rows[0],
              apartment_id: '__global__',
            })
          : createDefaultExternalAd('__global__');
        res.json({
          adSlot: { ...globalAdSlot, apartmentId },
          globalAdSlot,
          hasApartmentOverride: false,
        });
        return;
      }

      const store = readStore();
      if (store.externalAds?.[apartmentId]) {
        deleteUploadedPhotoIfLocal(store.externalAds[apartmentId].imageUrl);
        delete store.externalAds[apartmentId];
        writeStore(store);
      }
      const globalAdSlot =
        store.globalAd || createDefaultExternalAd('__global__');
      res.json({
        adSlot: { ...globalAdSlot, apartmentId },
        globalAdSlot,
        hasApartmentOverride: false,
      });
    })
  );

  app.put(
    '/api/ad-slot/global',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      if (!req.session?.isMaster) {
        res.status(403).json({
          error: '전체 단지 공통 광고를 수정하려면 마스터 비밀번호 인증이 필요합니다.',
        });
        return;
      }

      const body = req.body as Parameters<typeof validateAndBuildAdRecord>[1] & {
        applyToAll?: boolean;
      };
      const { record, error } = validateAndBuildAdRecord('__global__', body);
      if (error || !record) {
        res.status(400).json({ error: error || '광고 설정이 올바르지 않습니다.' });
        return;
      }

      const applyToAll = body.applyToAll !== false;
      const apartmentId = req.session.apartmentId;

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        await pool.query(
          `INSERT INTO global_ad_slot (
            id, mode, sponsor_name, headline, description, image_url, link_url,
            cta_label, contact_info, adsense_client_id, adsense_slot_id, adfit_unit_id, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (id) DO UPDATE SET
            mode = EXCLUDED.mode,
            sponsor_name = EXCLUDED.sponsor_name,
            headline = EXCLUDED.headline,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            link_url = EXCLUDED.link_url,
            cta_label = EXCLUDED.cta_label,
            contact_info = EXCLUDED.contact_info,
            adsense_client_id = EXCLUDED.adsense_client_id,
            adsense_slot_id = EXCLUDED.adsense_slot_id,
            adfit_unit_id = EXCLUDED.adfit_unit_id,
            updated_at = EXCLUDED.updated_at`,
          [
            'default',
            record.mode,
            record.sponsorName,
            record.headline,
            record.description,
            record.imageUrl,
            record.linkUrl,
            record.ctaLabel,
            record.contactInfo,
            record.adsenseClientId,
            record.adsenseSlotId,
            record.adfitUnitId,
            record.updatedAt,
          ]
        );
        if (applyToAll) {
          await pool.query('DELETE FROM external_ads');
        }
        const aptFound = applyToAll
          ? { rows: [] }
          : await pool.query(
              'SELECT * FROM external_ads WHERE apartment_id = $1 LIMIT 1',
              [apartmentId]
            );
        const hasApartmentOverride = aptFound.rows.length > 0;
        const effectiveAd = hasApartmentOverride
          ? mapExternalAdRow(aptFound.rows[0])
          : { ...record, apartmentId };
        res.json({
          adSlot: effectiveAd,
          globalAdSlot: record,
          hasApartmentOverride,
        });
        return;
      }

      const store = readStore();
      const prevGlobalImg = store.globalAd?.imageUrl;
      if (prevGlobalImg && prevGlobalImg !== record.imageUrl) {
        deleteUploadedPhotoIfLocal(prevGlobalImg);
      }
      store.globalAd = record;
      if (applyToAll) {
        if (store.externalAds) {
          for (const item of Object.values(store.externalAds)) {
            if (item.imageUrl && item.imageUrl !== record.imageUrl) {
              deleteUploadedPhotoIfLocal(item.imageUrl);
            }
          }
        }
        store.externalAds = {};
      }
      writeStore(store);

      const aptOverride = store.externalAds?.[apartmentId];
      const hasApartmentOverride = Boolean(aptOverride);
      res.json({
        adSlot: aptOverride || { ...record, apartmentId },
        globalAdSlot: record,
        hasApartmentOverride,
      });
    })
  );

  // Update Passwords
  app.patch(
    '/api/settings/passwords',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const { companyPassword, adminPassword } = req.body as {
        companyPassword?: string;
        adminPassword?: string;
      };
      const apartmentId = req.session!.apartmentId;

      if (companyPassword !== undefined && companyPassword.trim().length < 4) {
        res
          .status(400)
          .json({ error: '회사 공통 비밀번호는 4자 이상이어야 합니다.' });
        return;
      }
      if (adminPassword !== undefined && adminPassword.trim().length < 4) {
        res
          .status(400)
          .json({ error: '관리자 비밀번호는 4자 이상이어야 합니다.' });
        return;
      }

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const found = await pool.query(
          'SELECT * FROM apartments WHERE id = $1 LIMIT 1',
          [apartmentId]
        );
        if (found.rows.length === 0) {
          res.status(404).json({ error: '아파트 정보를 찾을 수 없습니다.' });
          return;
        }
        const apt = mapApartmentRow(found.rows[0]);
        const nextCompanyPw =
          companyPassword !== undefined
            ? companyPassword.trim()
            : apt.companyPassword;
        const nextAdminPw =
          adminPassword !== undefined
            ? adminPassword.trim()
            : apt.adminPassword;
        await pool.query(
          'UPDATE apartments SET company_password = $1, admin_password = $2 WHERE id = $3',
          [nextCompanyPw, nextAdminPw, apartmentId]
        );
        res.json({ ok: true });
        return;
      }

      const store = readStore();
      const apt = store.apartments.find((a) => a.id === apartmentId);
      if (!apt) {
        res.status(404).json({ error: '아파트 정보를 찾을 수 없습니다.' });
        return;
      }

      if (companyPassword !== undefined) {
        apt.companyPassword = companyPassword.trim();
      }
      if (adminPassword !== undefined) {
        apt.adminPassword = adminPassword.trim();
      }

      writeStore(store);
      res.json({ ok: true });
    })
  );

  // CSV / Excel Unified Download
  app.get(
    '/api/logs/export.csv',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const query = req.query as {
        workerId?: string;
        date?: string;
        q?: string;
        status?: string;
      };
      const apartmentId = req.session!.apartmentId;

      let aptName = '관리사무소';
      let logs: WorkLogRecord[] = [];

      if (USE_POSTGRES) {
        await ensurePgReady();
        const pool = getPgPool();
        const [aptRes, logsRes] = await Promise.all([
          pool.query('SELECT name FROM apartments WHERE id = $1 LIMIT 1', [
            apartmentId,
          ]),
          pool.query('SELECT * FROM work_logs WHERE apartment_id = $1', [
            apartmentId,
          ]),
        ]);
        if (aptRes.rows[0]?.name) aptName = String(aptRes.rows[0].name);
        logs = filterAndSortLogs(logsRes.rows.map(mapLogRow), query);
      } else {
        const store = readStore();
        const apt = store.apartments.find((a) => a.id === apartmentId);
        aptName = apt?.name || '관리사무소';
        logs = filterAndSortLogs(
          store.logs.filter((l) => l.apartmentId === apartmentId),
          query
        );
      }

      const statusText = (s?: WorkStatus) =>
        s === 'pending' ? '대기' : s === 'in_progress' ? '진행 중' : '완료';

      const headers = [
        '번호',
        '단지명',
        '진행상태',
        '작업날짜',
        '작성자',
        '직책',
        '작업장소',
        '처리내용',
        '사진첨부',
        '최초등록시각',
        '최종수정시각',
      ];
      const rows = logs.map((log, index) => [
        String(index + 1),
        aptName,
        statusText(log.status),
        log.workDate,
        log.workerName,
        log.workerRole || '직원',
        log.location,
        log.content,
        log.photoUrl ? '첨부됨' : '미첨부',
        formatKoreanTimestamp(log.createdAt),
        formatKoreanTimestamp(log.updatedAt),
      ]);

      const csvBody = [headers, ...rows]
        .map((row) => row.map(escapeCsvCell).join(','))
        .join('\r\n');

      const bom = '\uFEFF';
      const filename = `${aptName.replace(/\s+/g, '')}_공동작업일지_${getKoreaDateString(0)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      res.send(bom + csvBody);
    })
  );

  // Ensure unmatched /api/* routes always return JSON (never Express HTML 404)
  app.use('/api', (req: Request, res: Response) => {
    console.warn('[API 404]', {
      method: req.method,
      url: req.originalUrl || req.url,
    });
    res.status(404).json({
      code: 'API_NOT_FOUND',
      error: `요청하신 API 경로를 찾을 수 없습니다. (${req.method} ${req.originalUrl || req.url})`,
    });
  });

  // Express JSON error boundary
  app.use(
    (err: unknown, req: Request, res: Response, _next: NextFunction) => {
      const message = err instanceof Error ? err.message : String(err || '');
      const pgCode =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : undefined;
      console.error('[API Error Boundary]', {
        method: req.method,
        path: req.originalUrl || req.url,
        storage: USE_POSTGRES ? 'postgres' : IS_VERCEL ? 'memory' : 'file',
        secretSource: SESSION_SECRET_SOURCE,
        pgCode,
        message,
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
      });

      if (
        USE_POSTGRES &&
        /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|getaddrinfo|password authentication failed|SASL|SCRAM|database .* does not exist|no pg_hba\.conf|SSL|certificate|connection terminated|timeout exceeded|Tenant or user not found|max clients/i.test(
          `${pgCode || ''} ${message}`
        )
      ) {
        res.status(503).json({
          code: 'DB_CONNECTION_ERROR',
          error:
            '클라우드 DB 연결에 실패했습니다. Vercel 환경 변수(DATABASE_URL) 주소를 확인한 뒤 다시 배포해 주세요.',
        });
        return;
      }

      res.status(500).json({
        code: pgCode || 'INTERNAL_SERVER_ERROR',
        error: '서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  );

  return app;
}

export const app = createApp();

export function handleVercelApi(req: Request, res: Response): void {
  try {
    const rawUrl = req.url || '/';
    const originalUrlHeader =
      (req.headers['x-vercel-original-url'] as string | undefined) ||
      (req.headers['x-forwarded-uri'] as string | undefined) ||
      (req.headers['x-rewrite-url'] as string | undefined);

    if (
      originalUrlHeader &&
      originalUrlHeader.startsWith('/api/') &&
      !originalUrlHeader.startsWith('/api/index')
    ) {
      req.url = originalUrlHeader;
    } else if (
      rawUrl === '/api/index' ||
      rawUrl.startsWith('/api/index?') ||
      rawUrl.startsWith('/api/[...path]')
    ) {
      const qIdx = rawUrl.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(rawUrl.slice(qIdx + 1));
        const dynamicPath = params.get('...path') || params.get('path');
        if (dynamicPath) {
          params.delete('...path');
          params.delete('path');
          const rest = params.toString();
          const normalizedSubpath = dynamicPath.replace(/^\/+/, '');
          req.url = `/api/${normalizedSubpath}${rest ? `?${rest}` : ''}`;
        }
      }
    } else if (!rawUrl.startsWith('/api')) {
      req.url = `/api${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }

    app(req, res);
  } catch (err) {
    console.error('Vercel API invocation error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: '서버 API 초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  }
}

export default app;

function isDirectServerExecution(): boolean {
  if (IS_VERCEL || typeof process.argv[1] !== 'string' || !__filename) {
    return false;
  }
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(__filename);
  }
}

async function startStandaloneServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

if (isDirectServerExecution()) {
  startStandaloneServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
