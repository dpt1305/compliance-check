import { NextResponse } from 'next/server';
import { loadSupportedTypes } from '@/lib/services/excel-mapping';

// Force dynamic — types must be resolved at request time, not pre-rendered at build
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const types = await loadSupportedTypes();
  return NextResponse.json({ types });
}
