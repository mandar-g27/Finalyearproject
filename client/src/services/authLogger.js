/**
 * Auth Logger — stores authentication attempts in localStorage
 * Each entry: {
 *   id, identity, status, steps, timestamp,
 *   sessionId, ip, device, duration, riskScore, exitReason
 * }
 */

const STORAGE_KEY = 'securevault_auth_log';
const SESSION_KEY = 'securevault_sessions';
const MAX_ENTRIES = 200;

/* ─── Internal helpers ─────────────────────────────────────── */

function readLog(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function writeLog(key, log) {
  localStorage.setItem(key, JSON.stringify(log.slice(0, MAX_ENTRIES)));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ─── Mock seed data (runs once) ──────────────────────────── */

const MOCK_IDENTITIES = [
  'Mandar Gote', 'Priya Sharma', 'Ravi Kumar', 'Aisha Khan',
  'Unknown', 'Sneha Patil', 'Dev Anand', 'Unknown',
];

const MOCK_IPS = [
  '192.168.1.101', '10.0.0.22', '172.16.5.88',
  '192.168.1.45', '10.10.0.3',
];

const MOCK_DEVICES = [
  'Chrome / Windows 11', 'Firefox / Ubuntu 22', 'Edge / Windows 10',
  'Safari / macOS Ventura', 'Chrome / Android 13',
];

const MOCK_EXIT_REASONS = {
  granted: ['All factors passed', '3-Factor verification complete'],
  denied: [
    'Face mismatch', 'Voice passphrase incorrect',
    'Fingerprint not matched', 'Too many failed attempts',
  ],
  expired: ['Session timed out (60s)', 'Inactivity timeout'],
};

function mockEntry(hoursAgo) {
  const status = ['granted', 'granted', 'denied', 'denied', 'expired'][
    Math.floor(Math.random() * 5)
  ];
  const identity =
    status === 'denied' && Math.random() > 0.4
      ? 'Unknown'
      : MOCK_IDENTITIES[Math.floor(Math.random() * MOCK_IDENTITIES.length)];

  const faceOk = status === 'granted' || Math.random() > 0.5;
  const voiceOk = status === 'granted' || (faceOk && Math.random() > 0.4);
  const fpStatus =
    status === 'granted'
      ? 'pass'
      : status === 'expired'
      ? 'pending'
      : Math.random() > 0.5
      ? 'fail'
      : 'pending';

  const ts = new Date(Date.now() - hoursAgo * 3600_000 - Math.random() * 3600_000);

  return {
    id: uid(),
    identity,
    status,
    steps: { face: faceOk, voice: voiceOk, fingerprint: fpStatus },
    timestamp: ts.toISOString(),
    sessionId: 'sess_' + uid().slice(0, 10),
    ip: MOCK_IPS[Math.floor(Math.random() * MOCK_IPS.length)],
    device: MOCK_DEVICES[Math.floor(Math.random() * MOCK_DEVICES.length)],
    duration: Math.floor(Math.random() * 55 + 5),           // 5–60 s
    riskScore: status === 'denied' ? Math.floor(Math.random() * 45 + 55)
               : status === 'expired' ? Math.floor(Math.random() * 30 + 30)
               : Math.floor(Math.random() * 25 + 5),        // low for granted
    exitReason: MOCK_EXIT_REASONS[status][
      Math.floor(Math.random() * MOCK_EXIT_REASONS[status].length)
    ],
  };
}

/**
 * Seed mock data if the log is empty (first load only).
 */
export function seedMockData() {
  const existing = readLog(STORAGE_KEY);
  if (existing.length > 0) return;

  const mock = [];
  // 28 entries spread over last 72 hours
  const spread = [0.1, 0.5, 1, 2, 3, 5, 7, 9, 12, 14, 16, 18, 20, 24,
                  26, 28, 30, 35, 40, 45, 48, 52, 55, 60, 64, 68, 70, 72];
  spread.forEach((h) => mock.push(mockEntry(h)));

  writeLog(STORAGE_KEY, mock);

  // Seed session log too
  const sessions = mock
    .filter((e) => e.status === 'granted')
    .map((e) => ({
      sessionId: e.sessionId,
      identity: e.identity,
      ip: e.ip,
      device: e.device,
      loginAt: e.timestamp,
      logoutAt: new Date(new Date(e.timestamp).getTime() + e.duration * 1000 * 10).toISOString(),
      duration: e.duration,
      status: 'ended',
    }));
  writeLog(SESSION_KEY, sessions);
}

/* ─── Public API ───────────────────────────────────────────── */

/**
 * Log a new authentication attempt.
 */
export function logAuthAttempt(entry) {
  const log = readLog(STORAGE_KEY);
  log.unshift({
    id: uid(),
    identity: entry.identity || 'Unknown',
    status: entry.status,
    action: entry.action || 'System Check',
    logResult: entry.logResult || (entry.status === 'granted' ? 'Success' : 'Failed'),
    sessionId: entry.sessionId || 'sess_' + uid().slice(0, 10),
    steps: entry.steps || {},
    timestamp: new Date().toISOString(),
    ip: entry.ip || '127.0.0.1',
    device: entry.device || navigator.userAgent.slice(0, 60),
    duration: entry.duration || 0,
    riskScore: entry.riskScore ?? (entry.status === 'denied' ? 80 : 15),
    exitReason: entry.exitReason || '',
  });
  writeLog(STORAGE_KEY, log);
}

/** Get all auth attempts (newest first). */
export function getAuthLog() {
  return readLog(STORAGE_KEY);
}

/** Clear the auth log. */
export function clearAuthLog() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Get all sessions. */
export function getSessionLog() {
  return readLog(SESSION_KEY);
}

/** Clear the session log. */
export function clearSessionLog() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Derive aggregate stats from the auth log.
 */
export function getAuditStats(log) {
  const total = log.length;
  const granted = log.filter((e) => e.status === 'granted').length;
  const denied = log.filter((e) => e.status === 'denied').length;
  const expired = log.filter((e) => e.status === 'expired').length;
  const unknown = log.filter((e) => e.identity === 'Unknown').length;
  const successRate = total ? Math.round((granted / total) * 100) : 0;
  const avgRisk = total
    ? Math.round(log.reduce((s, e) => s + (e.riskScore ?? 0), 0) / total)
    : 0;

  return { total, granted, denied, expired, unknown, successRate, avgRisk };
}
