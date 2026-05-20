/**
 * SQLite tracking repository (original implementation).
 * Used by the proxy tracking-repo.ts when MONGODB_URI is not set.
 */
import { eq, asc, ne } from 'drizzle-orm';
import { db, bumpTrackingVersion } from '../index';
import { trackingMembers } from '../schema';
import type { TrackingMember, NewTrackingMember } from '../mongo/tracking-repo';

export type { TrackingMember, NewTrackingMember };

function now() { return new Date().toISOString(); }

export function readAll(): TrackingMember[] {
  return db.select().from(trackingMembers).orderBy(asc(trackingMembers.no), asc(trackingMembers.id)).all() as unknown as TrackingMember[];
}

export function readActive(): TrackingMember[] {
  return db.select().from(trackingMembers)
    .where(ne(trackingMembers.removedFromTracking, true))
    .orderBy(asc(trackingMembers.no), asc(trackingMembers.id))
    .all() as unknown as TrackingMember[];
}

export function insertMember(data: Omit<NewTrackingMember, never>): TrackingMember {
  const result = db.insert(trackingMembers).values({ ...data, createdAt: now(), updatedAt: now() }).returning().get();
  bumpTrackingVersion();
  return result as unknown as TrackingMember;
}

export function updateMember(id: number, data: Partial<Omit<NewTrackingMember, never>>): TrackingMember | null {
  const result = db.update(trackingMembers)
    .set({ ...data, updatedAt: now() })
    .where(eq(trackingMembers.id, id))
    .returning()
    .get();
  if (result) bumpTrackingVersion();
  return (result ?? null) as unknown as TrackingMember | null;
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

function renumberAll() {
  const rows = db.select({ id: trackingMembers.id })
    .from(trackingMembers)
    .orderBy(asc(trackingMembers.no), asc(trackingMembers.id))
    .all();
  const stmt = (db as unknown as { $client: import('better-sqlite3').Database }).$client
    .prepare('UPDATE tracking_members SET no = ? WHERE id = ?');
  rows.forEach((r, i) => stmt.run(i + 1, r.id));
}

export function replaceAll(members: Omit<NewTrackingMember, never>[]): void {
  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  raw.prepare('DELETE FROM tracking_members').run();
  if (members.length > 0) {
    const ts = now();
    const ins = db.insert(trackingMembers);
    const stmt = raw.prepare(`
      INSERT INTO tracking_members
        (no, project, name, email, serial, account, device_type,
         malware_alerts, compliance_checks, seed_configuration, operating_system,
         follow_up_action, response_from_ticket, tracking_status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    void ins;
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

export function mergeFromUpload(
  members: Omit<NewTrackingMember, never>[],
): { inserted: number; updated: number; preserved: number } {
  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  const ts = now();
  const existing = readAll();

  const byAccount = new Map<string, TrackingMember>();
  const byEmail   = new Map<string, TrackingMember>();
  for (const m of existing) {
    if (m.account) byAccount.set(m.account.trim().toLowerCase(), m);
    if (m.email)   byEmail.set(m.email.trim().toLowerCase(), m);
  }

  const mergeOp = raw.transaction((rows: typeof members) => {
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
          r.account ?? null, r.deviceType ?? null, ts, match.id,
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
          r.trackingStatus ?? null, ts, ts,
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
