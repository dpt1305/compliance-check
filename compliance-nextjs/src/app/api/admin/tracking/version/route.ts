import { NextResponse } from 'next/server';
import { getTrackingVersion } from '@/lib/db/index';

/**
 * GET /api/admin/tracking/version
 * Returns the current tracking_version counter from the DB.
 * Used by the admin UI to poll for changes and silently refresh the user list.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ mtime: getTrackingVersion() });
}
