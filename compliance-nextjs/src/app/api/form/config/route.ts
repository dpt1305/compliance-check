import { NextResponse } from 'next/server';
import { getActiveConfig } from '@/lib/services/project-config';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const config = await getActiveConfig();
    if (!config) {
      return NextResponse.json({ error: 'No config available' }, { status: 503 });
    }
    return NextResponse.json(config);
  } catch (err) {
    console.error('[form-config] Failed to load config:', err);
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
  }
}
