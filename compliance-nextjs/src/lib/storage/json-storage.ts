import fs from 'fs';
import path from 'path';

export type SubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Submission {
  id: number;
  account: string;
  submissionType: string;
  imagePath: string;
  imageUrl: string;
  imageOriginalName: string;
  imageSavedName: string;
  status: SubmissionStatus;
  validationResult: string;
  validationChecklist?: string;
  // Windows-specific checks
  hasClock?: boolean;
  hasWindowsUpdate?: boolean;
  hasDeviceName?: boolean;
  hasDeviceSerial?: boolean;
  hasDashboard?: boolean;
  // Mac-specific checks
  hasSeedDashboard?: boolean;
  hasTrellix?: boolean;
  hasTimestamp?: boolean;
  hasMacInfo?: boolean;
  // Thin-client specific checks
  hasThinVirusThreatProtection?: boolean;
  hasThinAccountProtection?: boolean;
  hasThinFirewallNetworkProtection?: boolean;
  hasThinAppBrowserControl?: boolean;
  hasThinDeviceSecurity?: boolean;
  hasThinDevicePerformanceHealth?: boolean;
  hasThinWindowsUpdate?: boolean;
  hasThinSerialNumber?: boolean;
  confidenceScore?: number;
  // SEED / Trellix values extracted by AI
  malwareAlerts?: string;
  complianceCheck?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  // AI-extracted device identifiers
  deviceSerial?: string;
  deviceName?: string;
  submissionDate: string;
}

function storagePath(): string {
  const p = process.env.STORAGE_JSON_PATH ?? './data/submissions.json';
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadAll(): Submission[] {
  const file = storagePath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Submission[];
  } catch {
    return [];
  }
}

function saveAll(submissions: Submission[]): void {
  const file = storagePath();
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(submissions, null, 2), 'utf-8');
}

function nextId(submissions: Submission[]): number {
  if (submissions.length === 0) return 1;
  return Math.max(...submissions.map(s => s.id)) + 1;
}

export function save(submission: Submission): Submission {
  const all = loadAll();
  if (!submission.id) submission.id = nextId(all);
  const idx = all.findIndex(s => s.id === submission.id);
  if (idx >= 0) all[idx] = submission;
  else all.push(submission);
  saveAll(all);
  return submission;
}

export function findById(id: number): Submission | null {
  return loadAll().find(s => s.id === id) ?? null;
}

export function findAll(): Submission[] {
  return loadAll();
}

export function deleteById(id: number): boolean {
  const all = loadAll();
  const next = all.filter(s => s.id !== id);
  if (next.length === all.length) return false;
  saveAll(next);
  return true;
}

export function existsById(id: number): boolean {
  return loadAll().some(s => s.id === id);
}

/** Delete all submissions whose submissionDate falls in the given month/year (1-indexed month).
 *  Returns the deleted submissions so callers can clean up associated image files. */
export function deleteByPeriod(month: number, year: number): Submission[] {
  const all = loadAll();
  const deleted: Submission[] = [];
  const remaining: Submission[] = [];
  for (const s of all) {
    const d = new Date(s.submissionDate);
    if (d.getMonth() + 1 === month && d.getFullYear() === year) {
      deleted.push(s);
    } else {
      remaining.push(s);
    }
  }
  if (deleted.length > 0) saveAll(remaining);
  return deleted;
}
