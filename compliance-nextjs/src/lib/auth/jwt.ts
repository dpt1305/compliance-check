import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'changeme-replace-in-production-must-be-256-bits-long!!'
);

export const COOKIE_NAME = 'admin_session';

// Minimum 1 hour; configurable via JWT_EXPIRY_HOURS
export const EXPIRY_HOURS = Math.max(1, parseInt(process.env.JWT_EXPIRY_HOURS ?? '1', 10));
export const EXPIRY_SECONDS = EXPIRY_HOURS * 3600;

export async function generateToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_HOURS}h`)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}
