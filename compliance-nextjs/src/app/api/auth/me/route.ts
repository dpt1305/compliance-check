import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const username = await verifyToken(token);
  if (!username) {
    return NextResponse.json({ message: 'Session expired' }, { status: 401 });
  }

  return NextResponse.json({ username, token });
}
