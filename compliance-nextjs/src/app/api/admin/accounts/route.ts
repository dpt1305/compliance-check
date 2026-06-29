import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findAll, findByUsername, saveAdmin } from '@/lib/db/admin-repo';
import { ensureDbReady } from '@/lib/db/bootstrap';

export const dynamic = 'force-dynamic';

/** Sanitized account view (no password) */
function toPublic(admin: Awaited<ReturnType<typeof findAll>>[number]) {
  return {
    id:                 admin.id,
    username:           admin.username,
    email:              admin.email,
    active:             admin.active,
    role:               admin.role ?? 'Admin',
    teams:              (() => { try { return JSON.parse(admin.teams ?? '[]') as string[]; } catch { return []; } })(),
    mustChangePassword: admin.mustChangePassword ?? false,
  };
}

export async function GET(): Promise<NextResponse> {
  await ensureDbReady();
  try {
    const admins = await findAll();
    return NextResponse.json(admins.map(toPublic));
  } catch (err) {
    console.error('[accounts-get]', err);
    return NextResponse.json({ message: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  await ensureDbReady();
  try {
    const body = await req.json() as {
      username?: string;
      email?: string;
      role?: string;
      teams?: string[];
    };

    const username = (body.username ?? '').trim();
    if (!username) {
      return NextResponse.json({ message: 'Username is required' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._@-]+$/.test(username)) {
      return NextResponse.json({ message: 'Username may only contain letters, numbers, dots, underscores, hyphens and @' }, { status: 400 });
    }

    const existing = await findByUsername(username);
    if (existing) {
      return NextResponse.json({ message: `Username "${username}" already exists` }, { status: 409 });
    }

    const role = body.role === 'Teamlead' ? 'Teamlead' : 'Admin';
    const teams = Array.isArray(body.teams) ? body.teams.map(t => String(t).trim()).filter(Boolean) : [];
    const teamsJson = JSON.stringify(teams);

    // Default password: UPPERCASE_USERNAME@123
    const defaultPassword = `${username.toUpperCase()}@123`;
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

    const created = await saveAdmin({
      username,
      password:           hashedPassword,
      email:              (body.email ?? '').trim(),
      active:             true,
      role,
      teams:              teamsJson,
      mustChangePassword: true,
    });

    return NextResponse.json(toPublic(created), { status: 201 });
  } catch (err) {
    console.error('[accounts-post]', err);
    return NextResponse.json({ message: 'Failed to create account' }, { status: 500 });
  }
}
