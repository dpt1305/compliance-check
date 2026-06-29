import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { generateToken, COOKIE_NAME, EXPIRY_SECONDS } from '@/lib/auth/jwt';
import { findByUsername } from '@/lib/db/admin-repo';
import { ensureDbReady } from '@/lib/db/bootstrap';

export async function POST(req: NextRequest): Promise<NextResponse> {
  await ensureDbReady();

  try {
    const body = await req.json() as { username?: string; password?: string };
    const username = body.username?.trim();
    const { password } = body;

    if (!username || !password) {
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    const admin = await findByUsername(username);
    if (!admin || !admin.active) {
      return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
    }

    const passwordMatch = bcrypt.compareSync(password, admin.password);
    if (!passwordMatch) {
      return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
    }

    const token = await generateToken(username);

    const res = NextResponse.json({ token, type: 'Bearer', username, role: admin.role ?? 'Admin', mustChangePassword: admin.mustChangePassword ?? false });

    // Set HttpOnly cookie so session survives tab closes / page refreshes
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: EXPIRY_SECONDS,
      secure: process.env.NODE_ENV === 'production',
    });

    return res;
  } catch {
    return NextResponse.json({ message: 'Login failed' }, { status: 500 });
  }
}
