import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth/jwt';

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ message: 'Logged out successfully' });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
