/**
 * Admin repository — async proxy.
 * Routes to MongoDB when MONGODB_URI is set, otherwise falls back to SQLite.
 */
import { isMongoEnabled } from './mongo/connection';

export interface AdminUser {
  id: string;
  username: string;
  password: string;
  email: string;
  active: boolean;
}

function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const s = require('./sqlite/admin-repo') as typeof import('./sqlite/admin-repo');
  return s;
}

export async function findByUsername(username: string): Promise<AdminUser | null> {
  if (isMongoEnabled()) {
    const { findByUsername: fn } = await import('./mongo/admin-repo');
    return fn(username);
  }
  return sqlite().findByUsername(username);
}

export async function saveAdmin(
  admin: Omit<AdminUser, 'id'> & { id?: string },
): Promise<AdminUser> {
  if (isMongoEnabled()) {
    const { saveAdmin: fn } = await import('./mongo/admin-repo');
    return fn(admin);
  }
  return sqlite().saveAdmin(admin);
}

export async function initDefaultAdmin(): Promise<void> {
  if (isMongoEnabled()) {
    const { initDefaultAdmin: fn } = await import('./mongo/admin-repo');
    return fn();
  }
  sqlite().initDefaultAdmin();
}
