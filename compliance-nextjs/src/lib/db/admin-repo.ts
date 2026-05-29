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
  role: string;
  teams: string;
  mustChangePassword: boolean;
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

export async function findAll(): Promise<AdminUser[]> {
  if (isMongoEnabled()) {
    const { findAll: fn } = await import('./mongo/admin-repo');
    return fn();
  }
  return sqlite().findAll();
}

export async function deleteAdmin(id: string): Promise<boolean> {
  if (isMongoEnabled()) {
    const { deleteAdmin: fn } = await import('./mongo/admin-repo');
    return fn(id);
  }
  return sqlite().deleteAdmin(id);
}

export async function initDefaultAdmin(): Promise<void> {
  if (isMongoEnabled()) {
    const { initDefaultAdmin: fn } = await import('./mongo/admin-repo');
    return fn();
  }
  sqlite().initDefaultAdmin();
}
