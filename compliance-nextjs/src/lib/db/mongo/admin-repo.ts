/**
 * MongoDB admin repository.
 */
import bcrypt from 'bcryptjs';
import { getMongoDb } from './connection';

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
  const { _id, ...rest } = doc;
  void _id;
  return {
    ...rest,
    role: rest.role ?? 'Admin',
    teams: rest.teams ?? '[]',
    mustChangePassword: rest.mustChangePassword ?? false,
  } as AdminUser;
}

export async function findAll(): Promise<AdminUser[]> {
  const c = await col();
  const docs = await c.find({}).toArray();
  return docs.map(({ _id, ...rest }) => ({
    ...rest,
    role: rest.role ?? 'Admin',
    teams: rest.teams ?? '[]',
    mustChangePassword: rest.mustChangePassword ?? false,
  } as AdminUser));
}

export async function saveAdmin(
  admin: Omit<AdminUser, 'id'> & { id?: string },
): Promise<AdminUser> {
  const c = await col();
  const id = admin.id ?? crypto.randomUUID();
  const doc: AdminUser = {
    id,
    username: admin.username,
    password: admin.password,
    email: admin.email ?? '',
    active: admin.active,
    role: admin.role ?? 'Admin',
    teams: admin.teams ?? '[]',
    mustChangePassword: admin.mustChangePassword ?? false,
  };

  if (admin.id) {
    const existing = await c.findOne({ id: admin.id });
    if (existing) {
      const { id: _id, ...update } = doc;
      void _id;
      await c.updateOne({ id: admin.id }, { $set: update });
      return doc;
    }
  }

  await c.insertOne(doc);
  return doc;
}

export async function deleteAdmin(id: string): Promise<boolean> {
  const c = await col();
  const result = await c.deleteOne({ id });
  return result.deletedCount > 0;
}

export async function initDefaultAdmin(): Promise<void> {
  const existing = await findByUsername('admin');
  if (existing) return;

  await saveAdmin({
    id:                 crypto.randomUUID(),
    username:           'admin',
    email:              'admin@compliance.local',
    password:           bcrypt.hashSync('Admin@123', 10),
    active:             true,
    role:               'Admin',
    teams:              '[]',
    mustChangePassword: false,
  });
}
