/**
 * Tracking repository facade.
 * SQLite support was removed; the app now uses MongoDB only.
 */

export type { TrackingMember, NewTrackingMember } from './mongo/tracking-repo';
export {
  accountInTracking,
  bumpTrackingVersion,
  deleteMember,
  ensureIndexes,
  findRowForAccount,
  getDistinctProjects,
  getTrackingVersion,
  insertMember,
  matchesTrackingRow,
  mergeFromUpload,
  readActive,
  readAll,
  replaceAll,
  updateMember,
  updateSeedFields,
} from './mongo/tracking-repo';
