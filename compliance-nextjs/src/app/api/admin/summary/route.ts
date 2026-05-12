import { NextResponse } from 'next/server';
import { findAll } from '@/lib/storage/json-storage';

export async function GET(): Promise<NextResponse> {
  const submissions = findAll();
  const summary: Record<string, number> = {};
  for (const s of submissions) {
    summary[s.status] = (summary[s.status] ?? 0) + 1;
  }
  return NextResponse.json(summary);
}
