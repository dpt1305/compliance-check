/**
 * MongoDB tracking repository.
 * Mirrors the interface of src/lib/db/tracking-repo.ts exactly so callers need no changes.
 *
 * Numeric IDs are preserved via a `numericId` field + `_counters` collection so all
 * existing API responses remain compatible.
 */
import { getMongoDb, getCounters } from './connection';
import { emitChange } from '../event-bus';

async function counters() { return getCounters(); }

export interface TrackingMember {
  id: number;
  no: number | null;
  project: string | null;
  name: string;
  email: string | null;
  serial: string | null;
  account: string | null;
  deviceType: string | null;
  malwareAlerts: string | null;
  complianceChecks: string | null;
  seedConfiguration: string | null;
  operatingSystem: string | null;
  followUpAction: string | null;
  responseFromTicket: string | null;
  trackingStatus: string | null;
  removedFromTracking: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export type NewTrackingMember = {
  no?: number | null;
  project?: string | null;
  name: string;
  email?: string | null;
  serial?: string | null;
  account?: string | null;
  deviceType?: string | null;
  malwareAlerts?: string | null;
  complianceChecks?: string | null;
  seedConfiguration?: string | null;
  operatingSystem?: string | null;
  followUpAction?: string | null;
  responseFromTicket?: string | null;
  trackingStatus?: string | null;
  removedFromTracking?: boolean;
};

const COLLECTION = 'tracking_members';

function now() { return new Date().toISOString(); }

async function col() {
  const db = await getMongoDb();
  return db.collection<TrackingMember & { _id?: unknown }>(COLLECTION);
}

async function nextId(): Promise<number> {
  const result = await (await counters()).findOneAndUpdate(
    { _id: 'tracking_members' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return result!.seq;
}

export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ id: 1 }, { unique: true });
  await c.createIndex({ account: 1 });
  await c.createIndex({ email: 1 });
  await c.createIndex({ removedFromTracking: 1 });
}

function strip(doc: TrackingMember & { _id?: unknown }): TrackingMember {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as TrackingMember;
}

export async function readAll(): Promise<TrackingMember[]> {
  const c = await col();
  const docs = await c.find({}).sort({ no: 1, id: 1 }).toArray();
  return docs.map(strip);
}

export async function readActive(): Promise<TrackingMember[]> {
  const c = await col();
  const docs = await c.find({ removedFromTracking: { $ne: true } }).sort({ no: 1, id: 1 }).toArray();
  return docs.map(strip);
}

export async function insertMember(
  data: Omit<NewTrackingMember, never>,
): Promise<TrackingMember> {
  const c = await col();
  const id = await nextId();
  const ts = now();
  const doc: TrackingMember = {
    id,
    no: data.no ?? null,
    project: data.project ?? null,
    name: data.name,
    email: data.email ?? null,
    serial: data.serial ?? null,
    account: data.account ?? null,
    deviceType: data.deviceType ?? null,
    malwareAlerts: data.malwareAlerts ?? null,
    complianceChecks: data.complianceChecks ?? null,
    seedConfiguration: data.seedConfiguration ?? null,
    operatingSystem: data.operatingSystem ?? null,
    followUpAction: data.followUpAction ?? null,
    responseFromTicket: data.responseFromTicket ?? null,
    trackingStatus: data.trackingStatus ?? null,
    removedFromTracking: false,
    createdAt: ts,
    updatedAt: ts,
  };
  await c.insertOne(doc);
  await bumpTrackingVersion();
  return doc;
}

export async function updateMember(
  id: number,
  data: Partial<Omit<NewTrackingMember, never>>,
): Promise<TrackingMember | null> {
  const c = await col();
  const result = await c.findOneAndUpdate(
    { id },
    { $set: { ...data, updatedAt: now() } },
    { returnDocument: 'after' },
  );
  if (result) await bumpTrackingVersion();
  return result ? strip(result) : null;
}

export async function deleteMember(id: number): Promise<boolean> {
  const c = await col();
  const result = await c.deleteOne({ id });
  if (result.deletedCount > 0) {
    await renumberAll();
    await bumpTrackingVersion();
    return true;
  }
  return false;
}

export async function updateSeedFields(
  id: number,
  fields: {
    malwareAlerts?: string;
    complianceChecks?: string;
    seedConfiguration?: string;
    operatingSystem?: string;
    followUpAction?: string;
    trackingStatus?: string;
  },
): Promise<boolean> {
  const c = await col();
  const result = await c.updateOne({ id }, { $set: { ...fields, updatedAt: now() } });
  if (result.matchedCount > 0) await bumpTrackingVersion();
  return result.matchedCount > 0;
}

async function renumberAll(): Promise<void> {
  const c = await col();
  const rows = await c.find({}).sort({ no: 1, id: 1 }).project<{ id: number }>({ id: 1 }).toArray();
  const ops = rows.map((r, i) => ({
    updateOne: { filter: { id: r.id }, update: { $set: { no: i + 1 } } },
  }));
  if (ops.length > 0) await c.bulkWrite(ops);
}

export async function replaceAll(
  members: Omit<NewTrackingMember, never>[],
): Promise<void> {
  const c = await col();
  const ts = now();

  // Reset counter
  await (await counters()).updateOne(
    { _id: 'tracking_members' },
    { $set: { seq: 0 } },
    { upsert: true },
  );

  await c.deleteMany({});

  if (members.length > 0) {
    let seq = 0;
    const docs: TrackingMember[] = members.map(m => ({
      id: ++seq,
      no: m.no ?? null,
      project: m.project ?? null,
      name: m.name,
      email: m.email ?? null,
      serial: m.serial ?? null,
      account: m.account ?? null,
      deviceType: m.deviceType ?? null,
      malwareAlerts: m.malwareAlerts ?? null,
      complianceChecks: m.complianceChecks ?? null,
      seedConfiguration: m.seedConfiguration ?? null,
      operatingSystem: m.operatingSystem ?? null,
      followUpAction: m.followUpAction ?? null,
      responseFromTicket: m.responseFromTicket ?? null,
      trackingStatus: m.trackingStatus ?? null,
      removedFromTracking: false,
      createdAt: ts,
      updatedAt: ts,
    }));
    await c.insertMany(docs);

    // Sync counter
    await (await counters()).updateOne(
      { _id: 'tracking_members' },
      { $set: { seq } },
      { upsert: true },
    );
  }

  await bumpTrackingVersion();
}

export async function mergeFromUpload(
  members: Omit<NewTrackingMember, never>[],
): Promise<{ inserted: number; updated: number; preserved: number }> {
  const c = await col();
  const ts = now();
  const existing = await readAll();

  const byAccount = new Map<string, TrackingMember>();
  const byEmail   = new Map<string, TrackingMember>();
  for (const m of existing) {
    if (m.account) byAccount.set(m.account.trim().toLowerCase(), m);
    if (m.email)   byEmail.set(m.email.trim().toLowerCase(), m);
  }

  // Mark all as removed
  await c.updateMany({}, { $set: { removedFromTracking: true, updatedAt: ts } });

  let inserted = 0;
  let updated  = 0;
  const matchedIds = new Set<number>();

  for (const r of members) {
    const normAccount = (r.account ?? '').trim().toLowerCase();
    const normEmail   = (r.email   ?? '').trim().toLowerCase();

    let match: TrackingMember | undefined;
    if (normAccount) match = byAccount.get(normAccount);
    if (!match && normEmail) match = byEmail.get(normEmail);
    if (match && matchedIds.has(match.id)) match = undefined;

    if (match) {
      matchedIds.add(match.id);
      await c.updateOne(
        { id: match.id },
        { $set: {
          no: r.no ?? null,
          project: r.project ?? null,
          name: r.name,
          email: r.email ?? null,
          serial: r.serial ?? null,
          account: r.account ?? null,
          deviceType: r.deviceType ?? null,
          removedFromTracking: false,
          updatedAt: ts,
        }},
      );
      updated++;
    } else {
      const id = await nextId();
      const doc: TrackingMember = {
        id,
        no: r.no ?? null,
        project: r.project ?? null,
        name: r.name,
        email: r.email ?? null,
        serial: r.serial ?? null,
        account: r.account ?? null,
        deviceType: r.deviceType ?? null,
        malwareAlerts: r.malwareAlerts ?? null,
        complianceChecks: r.complianceChecks ?? null,
        seedConfiguration: r.seedConfiguration ?? null,
        operatingSystem: r.operatingSystem ?? null,
        followUpAction: r.followUpAction ?? null,
        responseFromTicket: r.responseFromTicket ?? null,
        trackingStatus: r.trackingStatus ?? null,
        removedFromTracking: false,
        createdAt: ts,
        updatedAt: ts,
      };
      await c.insertOne(doc);
      inserted++;
    }
  }

  const preserved = existing.length - matchedIds.size;
  await bumpTrackingVersion();
  return { inserted, updated, preserved };
}

export async function getDistinctProjects(): Promise<string[]> {
  const c = await col();
  const values = await c.distinct('project', { removedFromTracking: { $ne: true } }) as (string | null)[];
  return (values.filter(Boolean) as string[]).sort();
}

// ── Version counter ─────────────────────────────────────────────────────────

export async function bumpTrackingVersion(): Promise<number> {
  const result = await (await counters()).findOneAndUpdate(
    { _id: 'tracking_version' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const version = result?.seq ?? 0;
  try {
    const { emitChange: emit } = await import('../event-bus');
    emit('tracking');
  } catch { /* ignore */ }
  return version;
}

export async function getTrackingVersion(): Promise<number> {
  const doc = await (await counters()).findOne({ _id: 'tracking_version' });
  return doc?.seq ?? 0;
}

// ── Matching helpers ─────────────────────────────────────────────────────────

function norm(v: string | null | undefined) { return (v ?? '').trim().toLowerCase(); }

export function findRowForAccount(rows: TrackingMember[], account: string): TrackingMember | undefined {
  const a = norm(account);
  return rows.find(r =>
    norm(r.account) === a || norm(r.email) === a || norm(r.name) === a,
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
