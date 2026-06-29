/**
 * MongoDB-backed tracking version helpers.
 * SQLite support was removed; these async facades now delegate directly to MongoDB.
 */
export async function bumpTrackingVersionAsync(): Promise<number> {
  const { bumpTrackingVersion } = await import('./mongo/tracking-repo');
  return bumpTrackingVersion();
}

export async function getTrackingVersionAsync(): Promise<number> {
  const { getTrackingVersion } = await import('./mongo/tracking-repo');
  return getTrackingVersion();
}