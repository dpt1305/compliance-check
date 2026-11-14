import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, extractBearerToken, verifyToken } from '@/lib/auth/jwt';
import { findByUsername } from '@/lib/db/admin-repo';
import { insertMember, updateMember, deleteMember } from '@/lib/db/tracking-repo';
import { getUserListData, type UserListEntry, type UserListResponse } from '@/lib/services/admin-user-list';

export type { UserListEntry, UserListResponse };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;

  // Resolve caller's role and teams
  const bearerToken = extractBearerToken(req.headers.get('authorization'));
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value ?? null;
  const token = bearerToken ?? cookieToken;
  const callerUsername = token ? await verifyToken(token) : null;
  let callerRole = 'Admin';
  let callerTeams: string[] = [];
  if (callerUsername) {
    const caller = await findByUsername(callerUsername);
    if (caller) {
      callerRole = caller.role ?? 'Admin';
      try {
        callerTeams = JSON.parse(caller.teams ?? '[]') as string[];
      } catch {
        callerTeams = [];
      }
    }
  }

  const parseIntOrNull = (v: string | null) => {
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };

  // Single source of truth: same service the Excel/ZIP exports use, so what the
  // list shows is exactly what gets exported. No project param = no project filter.
  const data = await getUserListData({
    projects: sp.getAll('project'),
    month: parseIntOrNull(sp.get('month')),
    year: parseIntOrNull(sp.get('year')),
    tags: sp.getAll('tag'),
    callerRole,
    callerTeams,
  });

  return NextResponse.json(data satisfies UserListResponse);
}

interface AddMemberBody {
  project?: string;
  name?: string;
  email?: string;
  serial?: string;
  account?: string;
  deviceType?: string;
}

interface UpdateMemberBody {
  rowNum?: number;
  project?: string;
  name?: string;
  email?: string;
  serial?: string;
  account?: string;
  deviceType?: string;
  trackingStatus?: string;
}

function trimValue(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as AddMemberBody;
    const name = trimValue(body.name);
    if (!name) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }

    const email = trimValue(body.email);
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ message: 'Email is invalid' }, { status: 400 });
    }

    const inserted = await insertMember({
      project:   trimValue(body.project) || null,
      name,
      email:     email || null,
      serial:    trimValue(body.serial) || null,
      account:   trimValue(body.account) || null,
      deviceType: trimValue(body.deviceType) || null,
      malwareAlerts: null,
      complianceChecks: null,
      seedConfiguration: null,
      operatingSystem: null,
      followUpAction: 'Default',
      responseFromTicket: 'Refer photo captured in folder',
      trackingStatus: 'Ok',
    });

    return NextResponse.json({ message: 'Member added successfully', rowNum: inserted.id }, { status: 201 });
  } catch (err) {
    console.error('[user-list-add-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to add member' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as UpdateMemberBody;
    const id = Number(body.rowNum);
    if (!id || id < 1) {
      return NextResponse.json({ message: 'Valid rowNum is required' }, { status: 400 });
    }

    const name = body.name !== undefined ? trimValue(body.name) : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ message: 'Name cannot be empty' }, { status: 400 });
    }

    const email = body.email !== undefined ? trimValue(body.email) : undefined;
    if (email !== undefined && email && !isValidEmail(email)) {
      return NextResponse.json({ message: 'Email is invalid' }, { status: 400 });
    }

    const updated = await updateMember(id, {
      ...(body.project !== undefined   && { project: trimValue(body.project) || null }),
      ...(name !== undefined           && { name }),
      ...(email !== undefined          && { email: email || null }),
      ...(body.serial !== undefined    && { serial: trimValue(body.serial) || null }),
      ...(body.account !== undefined   && { account: trimValue(body.account) || null }),
      ...(body.deviceType !== undefined && { deviceType: trimValue(body.deviceType) || null }),
      ...(body.trackingStatus !== undefined && { trackingStatus: trimValue(body.trackingStatus) || null }),
    });

    if (!updated) return NextResponse.json({ message: `Tracking row not found: ${id}` }, { status: 404 });
    return NextResponse.json({ message: 'Member updated successfully', rowNum: id });
  } catch (err) {
    console.error('[user-list-update-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const id = Number(req.nextUrl.searchParams.get('rowNum'));
    if (!id || id < 1) {
      return NextResponse.json({ message: 'Valid rowNum is required' }, { status: 400 });
    }

    const ok = await deleteMember(id);
    if (!ok) return NextResponse.json({ message: `Tracking row not found: ${id}` }, { status: 404 });
    return NextResponse.json({ message: 'Member deleted successfully', rowNum: id });
  } catch (err) {
    console.error('[user-list-delete-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to delete member' }, { status: 500 });
  }
}
