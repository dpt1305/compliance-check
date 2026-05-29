import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { findByUsername } from '@/lib/db/admin-repo';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const username = await verifyToken(token);
  if (!username) {
    return NextResponse.json({ message: 'Session expired' }, { status: 401 });
  }

  const admin = await findByUsername(username);
  if (!admin || !admin.active) {
    return NextResponse.json({ message: 'Admin account not found' }, { status: 404 });
  }

  return NextResponse.json({
    username,
    token,
    role: admin.role ?? 'Admin',
    teams: admin.teams ?? '[]',
    mustChangePassword: admin.mustChangePassword ?? false,
  });
}
