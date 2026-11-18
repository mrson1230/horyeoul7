import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
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

interface SessionRecord {
  token: string;
  apartmentId: string;
  isAdmin: boolean;
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
  sessions: Record<string, SessionRecord>;
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
        companyPassword: process.env.COMPANY_SHARED_PASSWORD || '7777',
        adminPassword: process.env.ADMIN_PASSWORD || 'admin7777',
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
    sessions: {},
  };
}

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStore(): StoreData {
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
            process.env.COMPANY_SHARED_PASSWORD ||
            '7777',
          adminPassword:
            parsed.settings?.adminPassword ||
            process.env.ADMIN_PASSWORD ||
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

    // Backfill apartmentId for any legacy records
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

    if (mutated) {
      writeStore(parsed);
    }
    return parsed;
  } catch {
    const initial = createInitialStore();
    writeStore(initial);
    return initial;
  }
}

function writeStore(data: StoreData): void {
  ensureStorage();
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
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

  ensureStorage();
  const filename = `work_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/api/uploads/${filename}`;
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

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }
  const store = readStore();
  const session = store.sessions[token];
  if (!session) {
    res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해 주세요.' });
    return;
  }
  req.session = session;
  next();
}

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

async function startServer() {
  ensureStorage();
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/uploads/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
      return;
    }
    res.sendFile(fullPath);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Public list of registered apartments (safe fields only)
  app.get('/api/apartments', (_req: Request, res: Response) => {
    const store = readStore();
    res.json({
      apartments: store.apartments.map(toPublicApartment),
    });
  });

  // Register a new apartment complex (accessible from login & admin)
  app.post('/api/apartments', (req: Request, res: Response) => {
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
      (officeName || '').trim() || (cleanName ? `${cleanName} 관리사무소` : '');
    const cleanCompanyId = (companyId || '').trim().toLowerCase();
    const cleanCompanyPw = (companyPassword || '').trim();
    const cleanAdminPw = (adminPassword || '').trim();

    if (!cleanName) {
      res.status(400).json({ error: '아파트 단지명을 입력해 주세요.' });
      return;
    }
    if (!/^[a-z0-9_-]{3,30}$/.test(cleanCompanyId)) {
      res.status(400).json({
        error: '공통 아이디는 영문 소문자, 숫자, -, _ 조합 3~30자로 입력해 주세요.',
      });
      return;
    }
    if (cleanCompanyPw.length < 4) {
      res.status(400).json({ error: '공통 비밀번호는 4자 이상이어야 합니다.' });
      return;
    }
    if (cleanAdminPw.length < 4) {
      res.status(400).json({ error: '관리자 비밀번호는 4자 이상이어야 합니다.' });
      return;
    }

    const store = readStore();
    if (store.apartments.some((a) => a.companyId.toLowerCase() === cleanCompanyId)) {
      res.status(409).json({ error: '이미 사용 중인 회사 공통 아이디입니다.' });
      return;
    }
    if (store.apartments.some((a) => a.name === cleanName)) {
      res.status(409).json({ error: '이미 등록된 아파트 단지명입니다.' });
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
    store.apartments.push(newApt);

    // Seed welcome notice for the newly registered apartment
    store.notices.unshift({
      id: `notice-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      apartmentId: newApt.id,
      title: `${cleanName} 공동 작업일지 운영 시작 안내`,
      content:
        '관리자 관리 화면에서 직원 명단을 등록하시면 바로 작업일지 작성 및 인수인계 공유를 시작할 수 있습니다.',
      isPinned: true,
      authorName: '관리사무소',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    let token: string | undefined;
    if (autoLogin) {
      token = crypto.randomBytes(24).toString('hex');
      store.sessions[token] = {
        token,
        apartmentId: newApt.id,
        isAdmin: true,
        createdAt: nowIso,
        lastSeenAt: nowIso,
      };
    }

    writeStore(store);
    res.status(201).json({
      apartment: toPublicApartment(newApt),
      token,
      session: token
        ? {
            authenticated: true,
            isAdmin: true,
            companyId: newApt.companyId,
            apartmentId: newApt.id,
            apartmentName: newApt.name,
            officeName: newApt.officeName,
          }
        : undefined,
    });
  });

  // Update current apartment info (Admin only)
  app.patch(
    '/api/apartments/current',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const { name, officeName } = req.body as {
        name?: string;
        officeName?: string;
      };
      const store = readStore();
      const apt = store.apartments.find((a) => a.id === req.session!.apartmentId);
      if (!apt) {
        res.status(404).json({ error: '아파트 정보를 찾을 수 없습니다.' });
        return;
      }

      const cleanName = (name ?? apt.name).trim();
      const cleanOffice = (officeName ?? apt.officeName).trim() || `${cleanName} 관리사무소`;
      if (!cleanName) {
        res.status(400).json({ error: '아파트 단지명을 입력해 주세요.' });
        return;
      }

      apt.name = cleanName;
      apt.officeName = cleanOffice;
      writeStore(store);
      res.json({ apartment: toPublicApartment(apt) });
    }
  );

  // Session check
  app.get('/api/auth/session', (req: Request, res: Response) => {
    const store = readStore();
    const defaultApt = store.apartments[0];
    const token = extractToken(req);
    const session = token ? store.sessions[token] : undefined;

    if (!session) {
      res.json({
        authenticated: false,
        isAdmin: false,
        companyId: defaultApt.companyId,
        apartmentId: defaultApt.id,
        apartmentName: defaultApt.name,
        officeName: defaultApt.officeName,
      });
      return;
    }

    const apt =
      store.apartments.find((a) => a.id === session.apartmentId) || defaultApt;
    res.json({
      authenticated: true,
      isAdmin: session.isAdmin,
      companyId: apt.companyId,
      apartmentId: apt.id,
      apartmentName: apt.name,
      officeName: apt.officeName,
    });
  });

  // Shared company login (supports multi-apartment)
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { companyId, password, apartmentId } = req.body as {
      companyId?: string;
      password?: string;
      apartmentId?: string;
    };
    const store = readStore();

    const trimmedId = (companyId || '').trim().toLowerCase();
    const apt = apartmentId
      ? store.apartments.find((a) => a.id === apartmentId)
      : store.apartments.find((a) => a.companyId.toLowerCase() === trimmedId);

    if (
      !apt ||
      !password ||
      apt.companyId.toLowerCase() !== trimmedId ||
      password !== apt.companyPassword
    ) {
      res.status(401).json({
        error: '회사 공통 아이디 또는 비밀번호가 일치하지 않습니다.',
      });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const nowIso = new Date().toISOString();
    store.sessions[token] = {
      token,
      apartmentId: apt.id,
      isAdmin: false,
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
      companyId: apt.companyId,
      apartmentId: apt.id,
      apartmentName: apt.name,
      officeName: apt.officeName,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractToken(req);
    if (token) {
      const store = readStore();
      if (store.sessions[token]) {
        delete store.sessions[token];
        writeStore(store);
      }
    }
    res.json({ ok: true });
  });

  // Admin unlock / lock (scoped to apartment)
  app.post('/api/auth/admin/unlock', requireAuth, (req: AuthedRequest, res: Response) => {
    const { adminPassword } = req.body as { adminPassword?: string };
    const store = readStore();
    const apt = store.apartments.find((a) => a.id === req.session!.apartmentId);
    if (!apt || !adminPassword || adminPassword !== apt.adminPassword) {
      res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
      return;
    }
    const token = req.session!.token;
    store.sessions[token].isAdmin = true;
    store.sessions[token].lastSeenAt = new Date().toISOString();
    writeStore(store);
    res.json({ isAdmin: true });
  });

  app.post('/api/auth/admin/lock', requireAuth, (req: AuthedRequest, res: Response) => {
    const store = readStore();
    const token = req.session!.token;
    if (store.sessions[token]) {
      store.sessions[token].isAdmin = false;
      writeStore(store);
    }
    res.json({ isAdmin: false });
  });

  // Workers (scoped to apartment)
  app.get('/api/workers', requireAuth, (req: AuthedRequest, res: Response) => {
    const store = readStore();
    const workers = store.workers.filter(
      (w) => w.apartmentId === req.session!.apartmentId
    );
    res.json({ workers });
  });

  app.post('/api/workers', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { name, role } = req.body as { name?: string; role?: string };
    const trimmedName = (name || '').trim();
    const trimmedRole = (role || '').trim() || '직원';
    const apartmentId = req.session!.apartmentId;

    if (!trimmedName) {
      res.status(400).json({ error: '직원 이름을 입력해 주세요.' });
      return;
    }
    if (trimmedName.length > 20) {
      res.status(400).json({ error: '직원 이름은 20자 이내로 입력해 주세요.' });
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

    const newWorker: WorkerRecord = {
      id: `w-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      apartmentId,
      name: trimmedName,
      role: trimmedRole,
      createdAt: new Date().toISOString(),
    };
    store.workers.push(newWorker);
    writeStore(store);
    res.status(201).json({ worker: newWorker });
  });

  app.delete('/api/workers/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
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
  });

  // Work Logs (scoped to apartment)
  app.get('/api/logs', requireAuth, (req: AuthedRequest, res: Response) => {
    const { workerId, date, q, status } = req.query as {
      workerId?: string;
      date?: string;
      q?: string;
      status?: string;
    };
    const apartmentId = req.session!.apartmentId;
    const store = readStore();
    let logs = store.logs.filter((l) => l.apartmentId === apartmentId);

    if (workerId && workerId !== 'all') {
      logs = logs.filter((l) => l.workerId === workerId || l.workerName === workerId);
    }
    if (status && status !== 'all') {
      logs = logs.filter((l) => (l.status || 'completed') === status);
    }
    if (date && date.trim() !== '') {
      logs = logs.filter((l) => l.workDate === date.trim());
    }
    if (q && q.trim() !== '') {
      const keyword = q.trim().toLowerCase();
      logs = logs.filter(
        (l) =>
          l.location.toLowerCase().includes(keyword) ||
          l.content.toLowerCase().includes(keyword) ||
          l.workerName.toLowerCase().includes(keyword)
      );
    }

    logs.sort((a, b) => {
      if (a.workDate !== b.workDate) {
        return b.workDate.localeCompare(a.workDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    res.json({ logs });
  });

  app.post('/api/logs', requireAuth, (req: AuthedRequest, res: Response) => {
    const { workerId, workDate, location, content, status, photoBase64 } = req.body as {
      workerId?: string;
      workDate?: string;
      location?: string;
      content?: string;
      status?: WorkStatus;
      photoBase64?: string | null;
    };

    const apartmentId = req.session!.apartmentId;
    const store = readStore();
    const worker = store.workers.find(
      (w) => w.id === workerId && w.apartmentId === apartmentId
    );
    if (!worker) {
      res.status(400).json({ error: '목록에서 작업자(직원 이름)를 먼저 선택해 주세요.' });
      return;
    }
    const cleanDate = (workDate || '').trim();
    const cleanLocation = (location || '').trim();
    const cleanContent = (content || '').trim();
    const cleanStatus: WorkStatus =
      status === 'pending' || status === 'in_progress' || status === 'completed'
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
          error: err instanceof Error ? err.message : '사진 업로드에 실패했습니다.',
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

    store.logs.unshift(newLog);
    writeStore(store);
    res.status(201).json({ log: newLog });
  });

  app.patch('/api/logs/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const { actingWorkerId, workDate, location, content, status, photoBase64, removePhoto } =
      req.body as {
        actingWorkerId?: string;
        workDate?: string;
        location?: string;
        content?: string;
        status?: WorkStatus;
        photoBase64?: string | null;
        removePhoto?: boolean;
      };

    const store = readStore();
    const idx = store.logs.findIndex(
      (l) => l.id === id && l.apartmentId === apartmentId
    );
    if (idx === -1) {
      res.status(404).json({ error: '해당 작업일지를 찾을 수 없습니다.' });
      return;
    }

    const existing = store.logs[idx];
    const isAdmin = Boolean(req.session?.isAdmin);
    const isOwner = Boolean(actingWorkerId && existing.workerId === actingWorkerId);

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        error: '본인이 작성한 작업일지만 수정할 수 있습니다. 타인의 기록 수정은 관리자 인증이 필요합니다.',
      });
      return;
    }

    const cleanDate = (workDate ?? existing.workDate).trim();
    const cleanLocation = (location ?? existing.location).trim();
    const cleanContent = (content ?? existing.content).trim();
    const cleanStatus: WorkStatus =
      status === 'pending' || status === 'in_progress' || status === 'completed'
        ? status
        : existing.status || 'completed';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || !cleanLocation || !cleanContent) {
      res.status(400).json({ error: '작업 날짜, 작업 장소, 처리 내용을 모두 입력해 주세요.' });
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
          error: err instanceof Error ? err.message : '사진 업로드에 실패했습니다.',
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

    store.logs[idx] = updated;
    writeStore(store);
    res.json({ log: updated });
  });

  app.delete('/api/logs/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
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
  });

  // Notices (scoped to apartment)
  app.get('/api/notices', requireAuth, (req: AuthedRequest, res: Response) => {
    const store = readStore();
    const notices = store.notices
      .filter((n) => n.apartmentId === req.session!.apartmentId)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
    res.json({ notices });
  });

  app.post('/api/notices', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { title, content, isPinned, authorName } = req.body as {
      title?: string;
      content?: string;
      isPinned?: boolean;
      authorName?: string;
    };
    const cleanTitle = (title || '').trim();
    const cleanContent = (content || '').trim();
    if (!cleanTitle || !cleanContent) {
      res.status(400).json({ error: '공지 제목과 내용을 모두 입력해 주세요.' });
      return;
    }

    const store = readStore();
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
    store.notices.unshift(notice);
    writeStore(store);
    res.status(201).json({ notice });
  });

  app.patch('/api/notices/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const { title, content, isPinned } = req.body as {
      title?: string;
      content?: string;
      isPinned?: boolean;
    };
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
      res.status(400).json({ error: '공지 제목과 내용을 모두 입력해 주세요.' });
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
  });

  app.delete('/api/notices/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const store = readStore();
    if (!store.notices.some((n) => n.id === id && n.apartmentId === apartmentId)) {
      res.status(404).json({ error: '해당 공지사항을 찾을 수 없습니다.' });
      return;
    }
    store.notices = store.notices.filter(
      (n) => !(n.id === id && n.apartmentId === apartmentId)
    );
    writeStore(store);
    res.json({ ok: true });
  });

  // Handovers (scoped to apartment)
  app.get('/api/handovers', requireAuth, (req: AuthedRequest, res: Response) => {
    const store = readStore();
    const handovers = store.handovers
      .filter((h) => h.apartmentId === req.session!.apartmentId)
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'pending' ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
    res.json({ handovers });
  });

  app.post('/api/handovers', requireAuth, (req: AuthedRequest, res: Response) => {
    const { workerId, targetShift, content } = req.body as {
      workerId?: string;
      targetShift?: string;
      content?: string;
    };
    const apartmentId = req.session!.apartmentId;
    const store = readStore();
    const worker = store.workers.find(
      (w) => w.id === workerId && w.apartmentId === apartmentId
    );
    if (!worker) {
      res.status(400).json({ error: '작성자(직원 이름)를 먼저 선택해 주세요.' });
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
    store.handovers.unshift(handover);
    writeStore(store);
    res.status(201).json({ handover });
  });

  app.patch('/api/handovers/:id/status', requireAuth, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const { status, actingWorkerId } = req.body as {
      status?: 'pending' | 'completed';
      actingWorkerId?: string;
    };
    const store = readStore();
    const idx = store.handovers.findIndex(
      (h) => h.id === id && h.apartmentId === apartmentId
    );
    if (idx === -1) {
      res.status(404).json({ error: '해당 인수인계 항목을 찾을 수 없습니다.' });
      return;
    }

    const worker = store.workers.find(
      (w) => w.id === actingWorkerId && w.apartmentId === apartmentId
    );
    const actorName = worker?.name || (req.session?.isAdmin ? '관리자' : '');
    if (!actorName) {
      res.status(400).json({ error: '인계 확인을 하려면 먼저 작업자 이름을 선택해 주세요.' });
      return;
    }

    const nextStatus = status === 'completed' ? 'completed' : 'pending';
    const nowIso = new Date().toISOString();
    const updated: HandoverRecord = {
      ...store.handovers[idx],
      status: nextStatus,
      completedBy: nextStatus === 'completed' ? actorName : null,
      completedAt: nextStatus === 'completed' ? nowIso : null,
      updatedAt: nowIso,
    };
    store.handovers[idx] = updated;
    writeStore(store);
    res.json({ handover: updated });
  });

  app.patch('/api/handovers/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const { actingWorkerId, targetShift, content } = req.body as {
      actingWorkerId?: string;
      targetShift?: string;
      content?: string;
    };
    const store = readStore();
    const idx = store.handovers.findIndex(
      (h) => h.id === id && h.apartmentId === apartmentId
    );
    if (idx === -1) {
      res.status(404).json({ error: '해당 인수인계 항목을 찾을 수 없습니다.' });
      return;
    }
    const existing = store.handovers[idx];
    const isAdmin = Boolean(req.session?.isAdmin);
    const isOwner = Boolean(actingWorkerId && existing.workerId === actingWorkerId);
    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: '본인이 작성한 인수인계만 수정할 수 있습니다.' });
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
    store.handovers[idx] = updated;
    writeStore(store);
    res.json({ handover: updated });
  });

  app.delete('/api/handovers/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const { actingWorkerId } = req.body as { actingWorkerId?: string };
    const store = readStore();
    const existing = store.handovers.find(
      (h) => h.id === id && h.apartmentId === apartmentId
    );
    if (!existing) {
      res.status(404).json({ error: '해당 인수인계 항목을 찾을 수 없습니다.' });
      return;
    }
    const isAdmin = Boolean(req.session?.isAdmin);
    const isOwner = Boolean(actingWorkerId && existing.workerId === actingWorkerId);
    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: '본인이 작성한 인수인계만 삭제할 수 있습니다.' });
      return;
    }
    store.handovers = store.handovers.filter(
      (h) => !(h.id === id && h.apartmentId === apartmentId)
    );
    writeStore(store);
    res.json({ ok: true });
  });

  // Event Banners (scoped to apartment)
  app.get('/api/banners', requireAuth, (req: AuthedRequest, res: Response) => {
    const store = readStore();
    const banners = (store.banners || [])
      .filter((b) => b.apartmentId === req.session!.apartmentId)
      .sort((a, b) => {
        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    res.json({ banners });
  });

  app.post('/api/banners', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
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

    const store = readStore();
    if (!Array.isArray(store.banners)) store.banners = [];

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

    store.banners.unshift(banner);
    writeStore(store);
    res.status(201).json({ banner });
  });

  app.patch('/api/banners/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
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

    const store = readStore();
    if (!Array.isArray(store.banners)) store.banners = [];

    const idx = store.banners.findIndex(
      (b) => b.id === id && b.apartmentId === apartmentId
    );
    if (idx === -1) {
      res.status(404).json({ error: '해당 배너를 찾을 수 없습니다.' });
      return;
    }

    const existing = store.banners[idx];
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
      eventLocation: (eventLocation ?? existing.eventLocation).trim().slice(0, 80),
      contactInfo: (contactInfo ?? existing.contactInfo).trim().slice(0, 80),
      isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    store.banners[idx] = updated;
    writeStore(store);
    res.json({ banner: updated });
  });

  app.delete('/api/banners/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const apartmentId = req.session!.apartmentId;
    const store = readStore();
    if (!Array.isArray(store.banners)) store.banners = [];

    if (!store.banners.some((b) => b.id === id && b.apartmentId === apartmentId)) {
      res.status(404).json({ error: '해당 배너를 찾을 수 없습니다.' });
      return;
    }

    store.banners = store.banners.filter(
      (b) => !(b.id === id && b.apartmentId === apartmentId)
    );
    writeStore(store);
    res.json({ ok: true });
  });

  // Update Passwords (Admin only, scoped to current apartment)
  app.patch(
    '/api/settings/passwords',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const { companyPassword, adminPassword } = req.body as {
        companyPassword?: string;
        adminPassword?: string;
      };
      const store = readStore();
      const apt = store.apartments.find((a) => a.id === req.session!.apartmentId);
      if (!apt) {
        res.status(404).json({ error: '아파트 정보를 찾을 수 없습니다.' });
        return;
      }

      if (companyPassword !== undefined) {
        if (companyPassword.trim().length < 4) {
          res.status(400).json({ error: '회사 공통 비밀번호는 4자 이상이어야 합니다.' });
          return;
        }
        apt.companyPassword = companyPassword.trim();
      }
      if (adminPassword !== undefined) {
        if (adminPassword.trim().length < 4) {
          res.status(400).json({ error: '관리자 비밀번호는 4자 이상이어야 합니다.' });
          return;
        }
        apt.adminPassword = adminPassword.trim();
      }

      writeStore(store);
      res.json({ ok: true });
    }
  );

  // CSV / Excel Unified Download (Admin only, scoped to apartment)
  app.get(
    '/api/logs/export.csv',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const { workerId, date, q, status } = req.query as {
        workerId?: string;
        date?: string;
        q?: string;
        status?: string;
      };
      const apartmentId = req.session!.apartmentId;
      const store = readStore();
      const apt = store.apartments.find((a) => a.id === apartmentId);
      let logs = store.logs.filter((l) => l.apartmentId === apartmentId);

      if (workerId && workerId !== 'all') {
        logs = logs.filter((l) => l.workerId === workerId || l.workerName === workerId);
      }
      if (status && status !== 'all') {
        logs = logs.filter((l) => (l.status || 'completed') === status);
      }
      if (date && date.trim() !== '') {
        logs = logs.filter((l) => l.workDate === date.trim());
      }
      if (q && q.trim() !== '') {
        const keyword = q.trim().toLowerCase();
        logs = logs.filter(
          (l) =>
            l.location.toLowerCase().includes(keyword) ||
            l.content.toLowerCase().includes(keyword) ||
            l.workerName.toLowerCase().includes(keyword)
        );
      }

      logs.sort((a, b) => {
        if (a.workDate !== b.workDate) {
          return b.workDate.localeCompare(a.workDate);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });

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
      const aptName = apt?.name || '관리사무소';
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
    }
  );

  // Vite middleware or production static
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
