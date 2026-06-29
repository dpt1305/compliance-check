/**
 * Submission repository facade.
 * SQLite support was removed; the app now uses MongoDB only.
 */
export { deleteById, deleteByPeriod, ensureIndexes, existsById, findAll, findById, save, updateStatus } from './mongo/submission-repo';
