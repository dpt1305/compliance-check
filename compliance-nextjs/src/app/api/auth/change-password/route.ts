import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { COOKIE_NAME, extractBearerToken, verifyToken } from '@/lib/auth/jwt';
import { findByUsername, saveAdmin } from '@/lib/db/admin-repo';
import { runMigrations } from '@/lib/db/migrate';

function resolveToken(req: NextRequest): string | null {
  const headerToken = extractBearerToken(req.headers.get('authorization'));
  if (headerToken) return headerToken;

  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  await runMigrations();

  try {
    const token = resolveToken(req);
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const username = await verifyToken(token);
    if (!username) {
      return NextResponse.json({ message: 'Unauthorized: invalid or expired token' }, { status: 401 });
    }

    const body = await req.json() as { currentPassword?: string; newPassword?: string };
    const { currentPassword, newPassword } = body;

    if (!newPassword) {
      return NextResponse.json({ message: 'New password is required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ message: 'New password must be at least 8 characters' }, { status: 400 });
    }

    const admin = await findByUsername(username);
    if (!admin || !admin.active) {
      return NextResponse.json({ message: 'Admin account not found' }, { status: 404 });
    }

    if (!admin.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json({ message: 'Current password is required' }, { status: 400 });
      }
      const passwordMatch = bcrypt.compareSync(currentPassword, admin.password);
      if (!passwordMatch) {
        return NextResponse.json({ message: 'Current password is incorrect' }, { status: 401 });
      }
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await saveAdmin({
      id: admin.id,
      username: admin.username,
      password: hashedPassword,
      email: admin.email,
      active: admin.active,
      role: admin.role ?? 'Admin',
      teams: admin.teams ?? '[]',
      mustChangePassword: false,
    });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch {
    return NextResponse.json({ message: 'Failed to change password' }, { status: 500 });
  }
}
