import fs from 'fs';
import path from 'path';

const DEFAULT = './data/tracking.xlsx';

/** Absolute path to the tracking file (may not exist yet). */
export function trackingFilePath(): string {
  const raw = process.env.EXCEL_UPDATE_PATH ?? DEFAULT;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/** Returns the path only if the file actually exists, otherwise null. */
export function existingTrackingPath(): string | null {
  const p = trackingFilePath();
  return fs.existsSync(p) ? p : null;
}
