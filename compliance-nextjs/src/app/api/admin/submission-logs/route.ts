import { NextRequest, NextResponse } from 'next/server';
import { queryLogs } from '@/lib/db/mongo/submission-log-repo';

/**
 * GET /api/admin/submission-logs  (admin JWT required, see middleware)
 *
 * Query params (all optional):
 *   requestId  exact request id (also returned to the browser as the X-Request-Id header)
 *   account    exact account, case-insensitive
 *   status     outcome, comma list: ACCEPTED, ACCEPTED_WARNING, REJECTED, SERIAL_MISMATCH, NO_SERIAL_REGISTERED,
 *              USER_NOT_FOUND, INVALID_INPUT, AI_UNAVAILABLE, SERVER_ERROR
 *   type       submission type (windows / mac / thin)
 *   from, to   ISO dates (createdAt range)
 *   limit      default 50, max 500;  skip  for paging
 *   full=1     include the raw AI reply and event list (omitted by default to keep lists light)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = req.nextUrl.searchParams;
  const date = (v: string | null) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const num = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

  const { total, items } = await queryLogs({
    requestId: p.get('requestId') ?? undefined,
    account: p.get('account') ?? undefined,
    status: p.get('status') ?? undefined,
    submissionType: p.get('type') ?? undefined,
    from: date(p.get('from')),
    to: date(p.get('to')),
    limit: num(p.get('limit')),
    skip: num(p.get('skip')),
  });

  const full = p.get('full') === '1' || !!p.get('requestId');
  const list = full
    ? items
    : items.map(({ ai, events, ...rest }) => ({
        ...rest,
        ai: ai && { ...ai, rawText: undefined },
        eventCount: events?.length ?? 0,
      }));
  return NextResponse.json({ total, items: list });
}
