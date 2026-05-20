/**
 * Provider factory — selects MongoDB or SQLite implementation at runtime
 * based on the MONGODB_URI environment variable.
 *
 * All repo modules re-export from here so the rest of the codebase has zero
 * awareness of which backend is active.
 */

export { isMongoEnabled } from './mongo/connection';
