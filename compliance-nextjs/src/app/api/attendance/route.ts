import { NextRequest, NextResponse } from 'next/server';
import { insertAttendance, normaliseStatus } from '@/lib/db/attendance-repo';
import type { AttendanceSession } from '@/lib/db/attendance-repo';
import { emitChange } from '@/lib/db/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/attendance
 *
 * Receives an attendance record from an external attendance system and persists
 * it to the local SQLite database.
 *
 * Authentication:
 *   Set ATTENDANCE_API_KEY in .env to require `x-api-key: <key>` on every request.
 *   If the env var is not set the endpoint is open (intended for development only).
 *
 * Request body (JSON):
 * {
 *   "date":      "2026-05-19",          // required — ISO date YYYY-MM-DD
 *   "time":      "08:30",               // required — HH:MM or HH:MM:SS
 *   "session":   "AM",                  // required — "AM" | "PM"
 *   "accountId": "TungDP2",             // required
 *   "status":    "ATTEND",              // required — "ATTEND" | "LATE" | "ABSENT"
 *   "remark":    "On time"              // optional
 * }
 *
 * Responses:
 *   201  { "success": true, "data": { ...record } }
 *   400  { "success": false, "error": "..." }
 *   401  { "success": false, "error": "Unauthorized" }
 *   500  { "success": false, "error": "Internal server error" }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── API key auth ──────────────────────────────────────────────────────────
  const requiredKey = process.env.ATTENDANCE_API_KEY;
  if (requiredKey) {
    const providedKey =
      req.headers.get('x-api-key') ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (providedKey !== requiredKey) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { date, time, session, accountId, status, remark } = body as Record<string, unknown>;

  // ── Validate required fields ──────────────────────────────────────────────
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return NextResponse.json({ success: false, error: '"date" is required and must be YYYY-MM-DD' }, { status: 400 });
  }
  if (!time || typeof time !== 'string') {
    return NextResponse.json({ success: false, error: '"time" is required (HH:MM or HH:MM:SS)' }, { status: 400 });
  }
  if (!session || (session !== 'AM' && session !== 'PM')) {
    return NextResponse.json({ success: false, error: '"session" is required and must be "AM" or "PM"' }, { status: 400 });
  }
  if (!accountId || typeof accountId !== 'string' || !accountId.trim()) {
    return NextResponse.json({ success: false, error: '"accountId" is required' }, { status: 400 });
  }
  if (!status || typeof status !== 'string') {
    return NextResponse.json({ success: false, error: '"status" is required (ATTEND | LATE | ABSENT)' }, { status: 400 });
  }

  const normalisedStatus = normaliseStatus(status as string);
  if (!normalisedStatus) {
    return NextResponse.json(
      { success: false, error: `"status" must be one of: ATTEND, LATE, ABSENT (got "${status}")` },
      { status: 400 },
    );
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  try {
    const record = await insertAttendance({
      date:      date.trim(),
      time:      (time as string).trim(),
      session:   session as AttendanceSession,
      accountId: (accountId as string).trim(),
      status:    normalisedStatus,
      remark:    remark != null ? String(remark).trim() || null : null,
    });

    // Notify any connected SSE clients (future real-time attendance dashboard)
    try { emitChange('attendance'); } catch { /* non-critical */ }

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (err) {
    console.error('[attendance] insert failed:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
