import { NextResponse } from 'next/server';
import { findAll } from '@/lib/db/submission-repo';
import { readActive as readTrackingRows } from '@/lib/db/tracking-repo';

export async function GET(): Promise<NextResponse> {
  const submissions  = findAll();
  const trackingRows = readTrackingRows();

  // Build a map from account → project using tracking data
  const accountToProject = new Map<string, string>();
  for (const row of trackingRows) {
    if (row.account && row.project) {
      accountToProject.set(row.account.toLowerCase(), row.project);
    }
  }

  return NextResponse.json(
    submissions.map(s => ({
      account: s.account,
      submissionType: s.submissionType,
      status: s.status,
      submissionDate: s.submissionDate,
      imageUrl: s.imageUrl,
      project: accountToProject.get(s.account?.toLowerCase() ?? '') ?? null,
    }))
  );
}
