/**
 * Admin repository facade.
 * SQLite support was removed; the app now uses MongoDB only.
 */

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

export {
  deleteAdmin,
  ensureIndexes,
  findAll,
  findByUsername,
  initDefaultAdmin,
  saveAdmin,
} from './mongo/admin-repo';
