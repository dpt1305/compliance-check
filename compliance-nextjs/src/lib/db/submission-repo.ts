import { eq, desc } from 'drizzle-orm';
import { db } from './index';
import { submissions } from './schema';
import { emitChange } from './event-bus';
import type { Submission } from '@/lib/storage/json-storage';

export type DbSubmission = typeof submissions.$inferSelect;

/** Convert DB row → legacy Submission shape (for API compatibility). */
function toSubmission(row: DbSubmission): Submission {
  return {
    id:               row.id,
    account:          row.account,
    submissionType:   row.submissionType,
    imagePath:        row.imagePath ?? '',
    imageUrl:         row.imageUrl ?? '',
    imageOriginalName:row.imageOriginalName ?? '',
    imageSavedName:   row.imageSavedName ?? '',
    status:           row.status as Submission['status'],
    validationResult: row.validationResult ?? '',
    validationChecklist: row.validationChecklist ?? undefined,
    submissionDate:   row.submissionDate,
    confidenceScore:  row.confidenceScore ?? undefined,
    hasClock:         row.hasClock ?? undefined,
    hasWindowsUpdate: row.hasWindowsUpdate ?? undefined,
    hasDeviceName:    row.hasDeviceName ?? undefined,
    hasDeviceSerial:  row.hasDeviceSerial ?? undefined,
    hasDashboard:     row.hasDashboard ?? undefined,
    hasSeedDashboard: row.hasSeedDashboard ?? undefined,
    hasTrellix:       row.hasTrellix ?? undefined,
    hasTimestamp:     row.hasTimestamp ?? undefined,
    hasMacInfo:       row.hasMacInfo ?? undefined,
    hasThinVirusThreatProtection:     row.hasThinVirusThreatProtection ?? undefined,
    hasThinAccountProtection:         row.hasThinAccountProtection ?? undefined,
    hasThinFirewallNetworkProtection: row.hasThinFirewallNetworkProtection ?? undefined,
    hasThinAppBrowserControl:         row.hasThinAppBrowserControl ?? undefined,
    hasThinDeviceSecurity:            row.hasThinDeviceSecurity ?? undefined,
    hasThinDevicePerformanceHealth:   row.hasThinDevicePerformanceHealth ?? undefined,
    hasThinWindowsUpdate:             row.hasThinWindowsUpdate ?? undefined,
    hasThinSerialNumber:              row.hasThinSerialNumber ?? undefined,
    malwareAlerts:    row.malwareAlerts ?? undefined,
    complianceCheck:  row.complianceCheck ?? undefined,
    seedConfiguration:row.seedConfiguration ?? undefined,
    operatingSystem:  row.operatingSystem ?? undefined,
    deviceSerial:     row.deviceSerial ?? undefined,
    deviceName:       row.deviceName ?? undefined,
  };
}

/** Convert legacy Submission → DB insert shape. */
function fromSubmission(s: Submission) {
  return {
    account:          s.account,
    submissionType:   s.submissionType,
    imagePath:        s.imagePath,
    imageUrl:         s.imageUrl,
    imageOriginalName:s.imageOriginalName,
    imageSavedName:   s.imageSavedName,
    status:           s.status,
    validationResult: s.validationResult,
    validationChecklist: s.validationChecklist ?? null,
    submissionDate:   s.submissionDate,
    confidenceScore:  s.confidenceScore ?? null,
    hasClock:                         s.hasClock ?? null,
    hasWindowsUpdate:                 s.hasWindowsUpdate ?? null,
    hasDeviceName:                    s.hasDeviceName ?? null,
    hasDeviceSerial:                  s.hasDeviceSerial ?? null,
    hasDashboard:                     s.hasDashboard ?? null,
    hasSeedDashboard:                 s.hasSeedDashboard ?? null,
    hasTrellix:                       s.hasTrellix ?? null,
    hasTimestamp:                     s.hasTimestamp ?? null,
    hasMacInfo:                       s.hasMacInfo ?? null,
    hasThinVirusThreatProtection:     s.hasThinVirusThreatProtection ?? null,
    hasThinAccountProtection:         s.hasThinAccountProtection ?? null,
    hasThinFirewallNetworkProtection: s.hasThinFirewallNetworkProtection ?? null,
    hasThinAppBrowserControl:         s.hasThinAppBrowserControl ?? null,
    hasThinDeviceSecurity:            s.hasThinDeviceSecurity ?? null,
    hasThinDevicePerformanceHealth:   s.hasThinDevicePerformanceHealth ?? null,
    hasThinWindowsUpdate:             s.hasThinWindowsUpdate ?? null,
    hasThinSerialNumber:              s.hasThinSerialNumber ?? null,
    malwareAlerts:    s.malwareAlerts ?? null,
    complianceCheck:  s.complianceCheck ?? null,
    seedConfiguration:s.seedConfiguration ?? null,
    operatingSystem:  s.operatingSystem ?? null,
    deviceSerial:     s.deviceSerial ?? null,
    deviceName:       s.deviceName ?? null,
  };
}

export function findAll(): Submission[] {
  return db.select().from(submissions).orderBy(desc(submissions.id)).all().map(toSubmission);
}

export function findById(id: number): Submission | null {
  const row = db.select().from(submissions).where(eq(submissions.id, id)).get();
  return row ? toSubmission(row) : null;
}

export function save(submission: Submission): Submission {
  if (submission.id) {
    // Upsert by id
    const existing = db.select().from(submissions).where(eq(submissions.id, submission.id)).get();
    if (existing) {
      const updated = db.update(submissions)
        .set(fromSubmission(submission))
        .where(eq(submissions.id, submission.id))
        .returning().get();
      emitChange('submissions');
      return toSubmission(updated);
    }
  }
  // Insert (auto-assigns id)
  const inserted = db.insert(submissions).values(fromSubmission(submission)).returning().get();
  emitChange('submissions');
  return toSubmission(inserted);
}

export function updateStatus(id: number, status: string): boolean {
  const result = db.update(submissions).set({ status }).where(eq(submissions.id, id)).returning().get();
  return !!result;
}

export function deleteById(id: number): boolean {
  const result = db.delete(submissions).where(eq(submissions.id, id)).returning().get();
  if (result) emitChange('submissions');
  return !!result;
}

export function existsById(id: number): boolean {
  return !!db.select().from(submissions).where(eq(submissions.id, id)).get();
}

export function deleteByPeriod(month: number, year: number): Submission[] {
  const all = findAll();
  const toDelete = all.filter(s => {
    const d = new Date(s.submissionDate);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });
  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  const del = raw.transaction(() => {
    for (const s of toDelete) raw.prepare('DELETE FROM submissions WHERE id = ?').run(s.id);
  });
  del();
  if (toDelete.length > 0) emitChange('submissions');
  return toDelete;
}
