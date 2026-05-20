import { db } from '../index';
import { attendance } from '../schema';
import { eq, and, desc } from 'drizzle-orm';

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

/** Normalise status — accepts "ABSEND" as a typo for "ABSENT". */
export function normaliseStatus(raw: string): AttendanceStatus | null {
  const s = raw.trim().toUpperCase();
  if (s === 'ATTEND') return 'ATTEND';
  if (s === 'LATE')   return 'LATE';
  if (s === 'ABSENT' || s === 'ABSEND') return 'ABSENT';
  return null;
}

/** Insert a new attendance record. Returns the created row. */
export function insertAttendance(input: InsertAttendanceInput): AttendanceRecord {
  const now = new Date().toISOString();
  const result = db
    .insert(attendance)
    .values({
      date:      input.date,
      time:      input.time,
      session:   input.session,
      accountId: input.accountId,
      status:    input.status,
      remark:    input.remark ?? null,
      createdAt: now,
    })
    .returning()
    .get();
  return result as unknown as AttendanceRecord;
}

/** Get all attendance records for a specific date (ordered by time asc). */
export function getAttendanceByDate(date: string): AttendanceRecord[] {
  return db
    .select()
    .from(attendance)
    .where(eq(attendance.date, date))
    .orderBy(attendance.time)
    .all() as unknown as AttendanceRecord[];
}

/** Get attendance records for a specific account (most recent first). */
export function getAttendanceByAccount(accountId: string, limit = 100): AttendanceRecord[] {
  return db
    .select()
    .from(attendance)
    .where(eq(attendance.accountId, accountId))
    .orderBy(desc(attendance.createdAt))
    .limit(limit)
    .all() as unknown as AttendanceRecord[];
}

/** Get attendance records for a specific date and account. */
export function getAttendanceByDateAndAccount(date: string, accountId: string): AttendanceRecord[] {
  return db
    .select()
    .from(attendance)
    .where(and(eq(attendance.date, date), eq(attendance.accountId, accountId)))
    .orderBy(attendance.time)
    .all() as unknown as AttendanceRecord[];
}
