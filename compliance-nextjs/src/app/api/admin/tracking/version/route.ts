import fs from 'fs';
import { NextResponse } from 'next/server';
import { existingTrackingPath } from '@/lib/utils/tracking-path';

/**
 * GET /api/admin/tracking/version
 * Returns the last-modified timestamp (ms) of the tracking file.
 * Very cheap — just fs.stat, no file read.
 * Used by the admin UI to poll for changes and silently refresh the user list.
 */
export async function GET(): Promise<NextResponse> {
  const filePath = existingTrackingPath();
  if (!filePath) {
    return NextResponse.json({ mtime: 0 });
  }
  try {
    const { mtimeMs } = fs.statSync(filePath);
    return NextResponse.json({ mtime: Math.floor(mtimeMs) });
  } catch {
    return NextResponse.json({ mtime: 0 });
  }
}
