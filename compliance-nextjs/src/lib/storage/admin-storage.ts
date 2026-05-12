import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export interface AdminUser {
  id: number;
  username: string;
  password: string;
  email: string;
  active: boolean;
}

function storagePath(): string {
  const p = process.env.STORAGE_JSON_ADMIN_PATH ?? './data/admins.json';
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAll(): AdminUser[] {
  const file = storagePath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as AdminUser[];
  } catch {
    return [];
  }
}

function saveAll(admins: AdminUser[]): void {
  const file = storagePath();
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(admins, null, 2), 'utf-8');
}

export function findByUsername(username: string): AdminUser | null {
  return loadAll().find(a => a.username === username) ?? null;
}

export function saveAdmin(admin: AdminUser): AdminUser {
  const all = loadAll();
  if (!admin.id) admin.id = all.length > 0 ? Math.max(...all.map(a => a.id)) + 1 : 1;
  const idx = all.findIndex(a => a.id === admin.id);
  if (idx >= 0) all[idx] = admin;
  else all.push(admin);
  saveAll(all);
  return admin;
}

export function initDefaultAdmin(): void {
  const existing = findByUsername('admin');
  if (existing?.password) return;

  if (existing && !existing.password) {
    existing.password = bcrypt.hashSync('Admin@123', 10);
    saveAdmin(existing);
    return;
  }

  saveAdmin({
    id: 1,
    username: 'admin',
    email: 'admin@compliance.local',
    password: bcrypt.hashSync('Admin@123', 10),
    active: true,
  });
}
