import { NextResponse } from 'next/server';
import { getSupportedTypes } from '@/lib/services/excel-mapping';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ types: getSupportedTypes() });
}
