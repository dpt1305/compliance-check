import { getMongoDb, getCounters } from './connection';

async function counters() { return getCounters(); }

export type AttendanceStatus = 'ATTEND' | 'LATE' | 'ABSENT';
export type AttendanceSession = 'AM' | 'PM';

export interface AttendanceRecord {
  id: number;
  date: string;
  time: string;
  session: AttendanceSession;
  accountId: string;
  status: AttendanceStatus;
  remark: string | null;
  createdAt: string;
}

export interface InsertAttendanceInput {
  date: string;
  time: string;
  session: AttendanceSession;
  accountId: string;
  status: AttendanceStatus;
  remark?: string | null;
}

const COLLECTION = 'attendance';

async function col() {
  const db = await getMongoDb();
  return db.collection<AttendanceRecord & { _id?: unknown }>(COLLECTION);
}

async function nextId(): Promise<number> {
  const result = await (await counters()).findOneAndUpdate(
    { _id: 'attendance' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return result!.seq;
}

export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ date: 1 });
  await c.createIndex({ accountId: 1 });
  await c.createIndex({ id: 1 }, { unique: true });
}

/** Normalise status — pure function, no DB. */
export function normaliseStatus(raw: string): AttendanceStatus | null {
  const s = raw.trim().toUpperCase();
  if (s === 'ATTEND') return 'ATTEND';
  if (s === 'LATE')   return 'LATE';
  if (s === 'ABSENT' || s === 'ABSEND') return 'ABSENT';
  return null;
}

export async function insertAttendance(input: InsertAttendanceInput): Promise<AttendanceRecord> {
  const c = await col();
  const id = await nextId();
  const doc: AttendanceRecord = {
    id,
    date:      input.date,
    time:      input.time,
    session:   input.session,
    accountId: input.accountId,
    status:    input.status,
    remark:    input.remark ?? null,
    createdAt: new Date().toISOString(),
  };
  await c.insertOne(doc);
  // Return without MongoDB _id
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...clean } = doc as AttendanceRecord & { _id?: unknown };
  return clean as AttendanceRecord;
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  const c = await col();
  const docs = await c.find({ date }).sort({ time: 1 }).toArray();
  return docs.map(({ _id, ...rest }) => rest as AttendanceRecord);
}

export async function getAttendanceByAccount(accountId: string, limit = 100): Promise<AttendanceRecord[]> {
  const c = await col();
  const docs = await c.find({ accountId }).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map(({ _id, ...rest }) => rest as AttendanceRecord);
}

export async function getAttendanceByDateAndAccount(date: string, accountId: string): Promise<AttendanceRecord[]> {
  const c = await col();
  const docs = await c.find({ date, accountId }).sort({ time: 1 }).toArray();
  return docs.map(({ _id, ...rest }) => rest as AttendanceRecord);
}
