import { eq, asc, ne } from 'drizzle-orm';
import { db, bumpTrackingVersion } from './index';
import { trackingMembers } from './schema';

export type TrackingMember = typeof trackingMembers.$inferSelect;
export type NewTrackingMember = typeof trackingMembers.$inferInsert;

function now() { return new Date().toISOString(); }

/** Returns ALL members including those removed from the latest upload (used internally for merge matching). */
export function readAll(): TrackingMember[] {
  return db.select().from(trackingMembers).orderBy(asc(trackingMembers.no), asc(trackingMembers.id)).all();
}

/** Returns only active members (removed_from_tracking = 0). Use this for all admin-facing views. */
export function readActive(): TrackingMember[] {
  return db.select().from(trackingMembers)
    .where(ne(trackingMembers.removedFromTracking, true))
    .orderBy(asc(trackingMembers.no), asc(trackingMembers.id))
    .all();
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

/** Replace ALL tracking members atomically (used during first-time migration from xlsx). */
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

/**
 * Smart merge for xlsx uploads.
 *
 * Rules:
 * 1. Match incoming rows against existing rows by account (case-insensitive), falling back to email.
 * 2. Matched rows: update identity fields (no, project, name, email, serial, account, deviceType)
 *    and clear the removed_from_tracking flag. Seed fields are PRESERVED.
 * 3. Unmatched incoming rows: insert as new members.
 * 4. Existing rows NOT present in the new file: keep in DB (so submissions stay mapped)
 *    but set removed_from_tracking = 1 to flag them as no longer in the official list.
 */
export function mergeFromUpload(
  members: Omit<NewTrackingMember, 'id' | 'createdAt' | 'updatedAt'>[],
): { inserted: number; updated: number; preserved: number } {
  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  const ts = now();

  const existing = readAll();

  // Build lookup maps: normalised account → member, normalised email → member
  const byAccount = new Map<string, TrackingMember>();
  const byEmail   = new Map<string, TrackingMember>();
  for (const m of existing) {
    if (m.account) byAccount.set(m.account.trim().toLowerCase(), m);
    if (m.email)   byEmail.set(m.email.trim().toLowerCase(), m);
  }

  const mergeOp = raw.transaction((rows: typeof members) => {
    // Mark all existing as "removed" — matched ones will be flipped back below
    raw.prepare('UPDATE tracking_members SET removed_from_tracking = 1, updated_at = ?').run(ts);

    let inserted = 0;
    let updated  = 0;
    const matchedIds = new Set<number>();

    for (const r of rows) {
      const normAccount = (r.account ?? '').trim().toLowerCase();
      const normEmail   = (r.email   ?? '').trim().toLowerCase();

      let match: TrackingMember | undefined;
      if (normAccount) match = byAccount.get(normAccount);
      if (!match && normEmail) match = byEmail.get(normEmail);
      // Skip if this existing row was already matched by a previous incoming row
      if (match && matchedIds.has(match.id)) match = undefined;

      if (match) {
        matchedIds.add(match.id);
        raw.prepare(`
          UPDATE tracking_members SET
            no = ?, project = ?, name = ?, email = ?, serial = ?,
            account = ?, device_type = ?,
            removed_from_tracking = 0, updated_at = ?
          WHERE id = ?
        `).run(
          r.no ?? null, r.project ?? null, r.name, r.email ?? null, r.serial ?? null,
          r.account ?? null, r.deviceType ?? null,
          ts, match.id,
        );
        updated++;
      } else {
        raw.prepare(`
          INSERT INTO tracking_members
            (no, project, name, email, serial, account, device_type,
             malware_alerts, compliance_checks, seed_configuration, operating_system,
             follow_up_action, response_from_ticket, tracking_status,
             removed_from_tracking, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
        `).run(
          r.no ?? null, r.project ?? null, r.name, r.email ?? null, r.serial ?? null,
          r.account ?? null, r.deviceType ?? null,
          r.malwareAlerts ?? null, r.complianceChecks ?? null,
          r.seedConfiguration ?? null, r.operatingSystem ?? null,
          r.followUpAction ?? null, r.responseFromTicket ?? null,
          r.trackingStatus ?? null,
          ts, ts,
        );
        inserted++;
      }
    }

    const preserved = existing.length - matchedIds.size;
    return { inserted, updated, preserved };
  });

  const result = mergeOp(members) as { inserted: number; updated: number; preserved: number };
  bumpTrackingVersion();
  return result;
}

export function getDistinctProjects(): string[] {
  const rows = db.select({ project: trackingMembers.project })
    .from(trackingMembers)
    .where(ne(trackingMembers.removedFromTracking, true))
    .all();
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
