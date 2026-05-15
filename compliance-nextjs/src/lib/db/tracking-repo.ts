import { eq, asc } from 'drizzle-orm';
import { db, bumpTrackingVersion } from './index';
import { trackingMembers } from './schema';

export type TrackingMember = typeof trackingMembers.$inferSelect;
export type NewTrackingMember = typeof trackingMembers.$inferInsert;

function now() { return new Date().toISOString(); }

export function readAll(): TrackingMember[] {
  return db.select().from(trackingMembers).orderBy(asc(trackingMembers.no), asc(trackingMembers.id)).all();
}

export function insertMember(data: Omit<NewTrackingMember, 'id' | 'createdAt' | 'updatedAt'>): TrackingMember {
  const result = db.insert(trackingMembers).values({ ...data, createdAt: now(), updatedAt: now() }).returning().get();
  bumpTrackingVersion();
  return result;
}

export function updateMember(id: number, data: Partial<Omit<NewTrackingMember, 'id' | 'createdAt'>>): TrackingMember | null {
  const result = db.update(trackingMembers)
    .set({ ...data, updatedAt: now() })
    .where(eq(trackingMembers.id, id))
    .returning()
    .get();
  if (result) bumpTrackingVersion();
  return result ?? null;
}

export function deleteMember(id: number): boolean {
  const result = db.delete(trackingMembers).where(eq(trackingMembers.id, id)).returning().get();
  if (result) {
    renumberAll();
    bumpTrackingVersion();
    return true;
  }
  return false;
}

export function updateSeedFields(id: number, fields: {
  malwareAlerts?: string;
  complianceChecks?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  followUpAction?: string;
  trackingStatus?: string;
}): boolean {
  const result = db.update(trackingMembers)
    .set({ ...fields, updatedAt: now() })
    .where(eq(trackingMembers.id, id))
    .returning()
    .get();
  if (result) bumpTrackingVersion();
  return !!result;
}

/** Re-sequence the `no` column after a delete (1-based, order by current no then id). */
function renumberAll() {
  const rows = db.select({ id: trackingMembers.id })
    .from(trackingMembers)
    .orderBy(asc(trackingMembers.no), asc(trackingMembers.id))
    .all();
  const stmt = (db as unknown as { $client: import('better-sqlite3').Database }).$client
    .prepare('UPDATE tracking_members SET no = ? WHERE id = ?');
  rows.forEach((r, i) => stmt.run(i + 1, r.id));
}

/** Replace ALL tracking members atomically (used during xlsx upload). */
export function replaceAll(members: Omit<NewTrackingMember, 'id' | 'createdAt' | 'updatedAt'>[]): void {
  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  raw.prepare('DELETE FROM tracking_members').run();
  if (members.length > 0) {
    const ts = now();
    const ins = db.insert(trackingMembers);
    // Batch insert
    const stmt = raw.prepare(`
      INSERT INTO tracking_members
        (no, project, name, email, serial, account, device_type,
         malware_alerts, compliance_checks, seed_configuration, operating_system,
         follow_up_action, response_from_ticket, tracking_status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    void ins; // suppress unused import warning — use raw stmt for bulk perf
    const insertMany = raw.transaction((rows: typeof members) => {
      for (const r of rows) {
        stmt.run(
          r.no ?? null, r.project ?? null, r.name, r.email ?? null, r.serial ?? null,
          r.account ?? null, r.deviceType ?? null,
          r.malwareAlerts ?? null, r.complianceChecks ?? null,
          r.seedConfiguration ?? null, r.operatingSystem ?? null,
          r.followUpAction ?? null, r.responseFromTicket ?? null,
          r.trackingStatus ?? null, ts, ts,
        );
      }
    });
    insertMany(members);
  }
  bumpTrackingVersion();
}

export function getDistinctProjects(): string[] {
  const rows = db.select({ project: trackingMembers.project }).from(trackingMembers).all();
  const set = new Set<string>();
  for (const r of rows) { if (r.project) set.add(r.project); }
  return [...set].sort();
}

// ── Matching helpers (mirrors tracking-reader.ts logic) ───────────────────

function norm(v: string | null | undefined) { return (v ?? '').trim().toLowerCase(); }

export function findRowForAccount(rows: TrackingMember[], account: string): TrackingMember | undefined {
  const a = norm(account);
  return rows.find(r =>
    norm(r.account) === a || norm(r.email) === a || norm(r.name) === a
  );
}

export function accountInTracking(rows: TrackingMember[], account: string): boolean {
  return !!findRowForAccount(rows, account);
}

export function matchesTrackingRow(
  row: TrackingMember,
  deviceSerial: string | null | undefined,
  deviceName: string | null | undefined,
  account: string | null | undefined,
): boolean {
  if (deviceSerial && row.serial && norm(deviceSerial) === norm(row.serial)) return true;
  if (deviceName && norm(deviceName) === norm(row.name)) return true;
  if (account) {
    const a = norm(account);
    if (norm(row.account) === a || norm(row.name) === a || norm(row.email) === a) return true;
    if (row.serial && norm(row.serial).includes(norm(account))) return true;
    if (row.email && norm(row.email).includes(norm(account))) return true;
  }
  return false;
}
