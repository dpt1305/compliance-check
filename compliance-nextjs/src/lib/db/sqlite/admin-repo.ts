/**
 * SQLite admin repository (original implementation).
 */
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../index';
import { admins } from '../schema';
import type { AdminUser } from '../admin-repo';

export type { AdminUser };

function toAdminUser(row: typeof admins.$inferSelect): AdminUser {
  return {
    id:                 row.id,
    username:           row.username,
    password:           row.password,
    email:              row.email ?? '',
    active:             row.active ?? true,
    role:               (row as unknown as { role?: string }).role ?? 'Admin',
    teams:              (row as unknown as { teams?: string }).teams ?? '[]',
    mustChangePassword: Boolean((row as unknown as { mustChangePassword?: boolean | number }).mustChangePassword),
  };
}

export function findByUsername(username: string): AdminUser | null {
  const row = db.select().from(admins).where(eq(admins.username, username)).get();
  return row ? toAdminUser(row) : null;
}

export function findAll(): AdminUser[] {
  const rows = db.select().from(admins).all();
  return rows.map(toAdminUser);
}

export function saveAdmin(admin: Omit<AdminUser, 'id'> & { id?: string }): AdminUser {
  const id = admin.id ?? crypto.randomUUID();
  const existing = admin.id
    ? db.select().from(admins).where(eq(admins.id, admin.id)).get()
    : null;

  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;

  if (existing) {
    raw.prepare(`UPDATE admins SET username=?, password=?, email=?, active=?, role=?, teams=?, must_change_password=? WHERE id=?`)
      .run(admin.username, admin.password, admin.email, admin.active ? 1 : 0,
           admin.role ?? 'Admin', admin.teams ?? '[]', admin.mustChangePassword ? 1 : 0, admin.id);
    return { ...admin, id: admin.id! } as AdminUser;
  }

  raw.prepare(`INSERT INTO admins (id, username, password, email, active, role, teams, must_change_password) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, admin.username, admin.password, admin.email ?? null, admin.active !== false ? 1 : 0,
         admin.role ?? 'Admin', admin.teams ?? '[]', admin.mustChangePassword ? 1 : 0);
  return { ...admin, id } as AdminUser;
}

export function deleteAdmin(id: string): boolean {
  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  const result = raw.prepare(`DELETE FROM admins WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function initDefaultAdmin(): void {
  const existing = findByUsername('admin');
  if (existing) return;

  const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
  raw.prepare(`INSERT INTO admins (id, username, email, password, active, role, teams, must_change_password) VALUES (?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), 'admin', 'admin@compliance.local', bcrypt.hashSync('Admin@123', 10), 1, 'Admin', '[]', 0);
}
