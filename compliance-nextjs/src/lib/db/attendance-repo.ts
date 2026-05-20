import { isMongoEnabled } from './mongo/connection';

export type { AttendanceStatus, AttendanceSession, AttendanceRecord, InsertAttendanceInput } from './mongo/attendance-repo';

function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const s = require('./sqlite/attendance-repo') as typeof import('./sqlite/attendance-repo');
  return s;
}

import type { AttendanceRecord, InsertAttendanceInput } from './mongo/attendance-repo';

/** Normalise status — accepts "ABSEND" as a typo for "ABSENT". Pure function, no DB. */
export function normaliseStatus(raw: string): 'ATTEND' | 'LATE' | 'ABSENT' | null {
  const s = raw.trim().toUpperCase();
  if (s === 'ATTEND') return 'ATTEND';
  if (s === 'LATE')   return 'LATE';
  if (s === 'ABSENT' || s === 'ABSEND') return 'ABSENT';
  return null;
}

export async function insertAttendance(input: InsertAttendanceInput): Promise<AttendanceRecord> {
  if (isMongoEnabled()) {
    const { insertAttendance: fn } = await import('./mongo/attendance-repo');
    return fn(input);
  }
  return sqlite().insertAttendance(input);
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  if (isMongoEnabled()) {
    const { getAttendanceByDate: fn } = await import('./mongo/attendance-repo');
    return fn(date);
  }
  return sqlite().getAttendanceByDate(date);
}

export async function getAttendanceByAccount(accountId: string, limit = 100): Promise<AttendanceRecord[]> {
  if (isMongoEnabled()) {
    const { getAttendanceByAccount: fn } = await import('./mongo/attendance-repo');
    return fn(accountId, limit);
  }
  return sqlite().getAttendanceByAccount(accountId, limit);
}

export async function getAttendanceByDateAndAccount(date: string, accountId: string): Promise<AttendanceRecord[]> {
  if (isMongoEnabled()) {
    const { getAttendanceByDateAndAccount: fn } = await import('./mongo/attendance-repo');
    return fn(date, accountId);
  }
  return sqlite().getAttendanceByDateAndAccount(date, accountId);
}
