import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from './index';
import { admins } from './schema';

export interface AdminUser {
  id: string;
  username: string;
  password: string;
  email: string;
  active: boolean;
}

function toAdminUser(row: typeof admins.$inferSelect): AdminUser {
  return {
    id:       row.id,
    username: row.username,
    password: row.password,
    email:    row.email ?? '',
    active:   row.active ?? true,
  };
}

export function findByUsername(username: string): AdminUser | null {
  const row = db.select().from(admins).where(eq(admins.username, username)).get();
  return row ? toAdminUser(row) : null;
}

export function saveAdmin(admin: Omit<AdminUser, 'id'> & { id?: string }): AdminUser {
  const id = admin.id ?? crypto.randomUUID();
  const existing = admin.id
    ? db.select().from(admins).where(eq(admins.id, admin.id)).get()
    : null;

  if (existing) {
    const updated = db.update(admins)
      .set({ username: admin.username, password: admin.password, email: admin.email, active: admin.active })
      .where(eq(admins.id, admin.id!))
      .returning().get();
    return toAdminUser(updated);
  }

  const inserted = db.insert(admins).values({ id, ...admin }).returning().get();
  return toAdminUser(inserted);
}

export function initDefaultAdmin(): void {
  const existing = findByUsername('admin');
  if (existing) return; // already seeded

  db.insert(admins).values({
    id:       crypto.randomUUID(),
    username: 'admin',
    email:    'admin@compliance.local',
    password: bcrypt.hashSync('Admin@123', 10),
    active:   true,
  }).run();
}
