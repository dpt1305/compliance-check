/**
 * Tracking repository — async proxy.
 * Routes to MongoDB when MONGODB_URI is set, otherwise falls back to SQLite.
 *
 * Re-exports TrackingMember / NewTrackingMember types from the Mongo module
 * (they are identical to the SQLite inferred types — using one source avoids duplication).
 */
import { isMongoEnabled } from './mongo/connection';

export type { TrackingMember, NewTrackingMember } from './mongo/tracking-repo';

function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const s = require('./sqlite/tracking-repo') as typeof import('./sqlite/tracking-repo');
  return s;
}

import type { TrackingMember, NewTrackingMember } from './mongo/tracking-repo';

export async function readAll(): Promise<TrackingMember[]> {
  if (isMongoEnabled()) {
    const { readAll: fn } = await import('./mongo/tracking-repo');
    return fn();
  }
  return sqlite().readAll();
}

export async function readActive(): Promise<TrackingMember[]> {
  if (isMongoEnabled()) {
    const { readActive: fn } = await import('./mongo/tracking-repo');
    return fn();
  }
  return sqlite().readActive();
}

export async function insertMember(
  data: Omit<NewTrackingMember, never>,
): Promise<TrackingMember> {
  if (isMongoEnabled()) {
    const { insertMember: fn } = await import('./mongo/tracking-repo');
    return fn(data);
  }
  return sqlite().insertMember(data);
}

export async function updateMember(
  id: number,
  data: Partial<Omit<NewTrackingMember, never>>,
): Promise<TrackingMember | null> {
  if (isMongoEnabled()) {
    const { updateMember: fn } = await import('./mongo/tracking-repo');
    return fn(id, data);
  }
  return sqlite().updateMember(id, data);
}

export async function deleteMember(id: number): Promise<boolean> {
  if (isMongoEnabled()) {
    const { deleteMember: fn } = await import('./mongo/tracking-repo');
    return fn(id);
  }
  return sqlite().deleteMember(id);
}

export async function updateSeedFields(
  id: number,
  fields: {
    malwareAlerts?: string;
    complianceChecks?: string;
    seedConfiguration?: string;
    operatingSystem?: string;
    followUpAction?: string;
    trackingStatus?: string;
  },
): Promise<boolean> {
  if (isMongoEnabled()) {
    const { updateSeedFields: fn } = await import('./mongo/tracking-repo');
    return fn(id, fields);
  }
  return sqlite().updateSeedFields(id, fields);
}

export async function replaceAll(
  members: Omit<NewTrackingMember, never>[],
): Promise<void> {
  if (isMongoEnabled()) {
    const { replaceAll: fn } = await import('./mongo/tracking-repo');
    return fn(members);
  }
  return sqlite().replaceAll(members);
}

export async function mergeFromUpload(
  members: Omit<NewTrackingMember, never>[],
): Promise<{ inserted: number; updated: number; preserved: number }> {
  if (isMongoEnabled()) {
    const { mergeFromUpload: fn } = await import('./mongo/tracking-repo');
    return fn(members);
  }
  return sqlite().mergeFromUpload(members);
}

export async function getDistinctProjects(): Promise<string[]> {
  if (isMongoEnabled()) {
    const { getDistinctProjects: fn } = await import('./mongo/tracking-repo');
    return fn();
  }
  return sqlite().getDistinctProjects();
}

// ── Matching helpers (pure functions — no DB, no async needed) ───────────────

export { findRowForAccount, accountInTracking, matchesTrackingRow } from './mongo/tracking-repo';
