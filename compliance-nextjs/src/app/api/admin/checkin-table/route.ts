import { NextResponse } from 'next/server';
import { findAll } from '@/lib/storage/json-storage';

export async function GET(): Promise<NextResponse> {
  const submissions = findAll();
  return NextResponse.json(
    submissions.map(s => ({
      account: s.account,
      submissionType: s.submissionType,
      status: s.status,
      submissionDate: s.submissionDate,
      imageUrl: s.imageUrl,
    }))
  );
}
