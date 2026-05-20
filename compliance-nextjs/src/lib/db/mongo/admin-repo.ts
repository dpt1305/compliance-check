/**
 * MongoDB admin repository.
 * Mirrors the interface of src/lib/db/admin-repo.ts exactly so callers need no changes.
 */
import bcrypt from 'bcryptjs';
import { getMongoDb } from './connection';
import type { AdminUser } from '../admin-repo';

export type { AdminUser };

const COLLECTION = 'admins';

async function col() {
  const db = await getMongoDb();
  return db.collection<AdminUser & { _id?: unknown }>(COLLECTION);
}

export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ username: 1 }, { unique: true });
}

export async function findByUsername(username: string): Promise<AdminUser | null> {
  const c = await col();
  const doc = await c.findOne({ username });
  if (!doc) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as AdminUser;
}

export async function saveAdmin(
  admin: Omit<AdminUser, 'id'> & { id?: string },
): Promise<AdminUser> {
  const c = await col();
  const id = admin.id ?? crypto.randomUUID();

  if (admin.id) {
    const existing = await c.findOne({ id: admin.id });
    if (existing) {
      const update = { username: admin.username, password: admin.password, email: admin.email, active: admin.active };
      await c.updateOne({ id: admin.id }, { $set: update });
      return { id: admin.id, ...update };
    }
  }

  const doc: AdminUser = { id, username: admin.username, password: admin.password, email: admin.email ?? '', active: admin.active };
  await c.insertOne(doc);
  return doc;
}

export async function initDefaultAdmin(): Promise<void> {
  const existing = await findByUsername('admin');
  if (existing) return;

  await saveAdmin({
    id:       crypto.randomUUID(),
    username: 'admin',
    email:    'admin@compliance.local',
    password: bcrypt.hashSync('Admin@123', 10),
    active:   true,
  });
}
