import { NextRequest, NextResponse } from 'next/server';
import { findAll } from '@/lib/db/submission-repo';
import { readActive, matchesTrackingRow } from '@/lib/db/tracking-repo';

export const dynamic = 'force-dynamic';

/**
 * GET /api/submission/member?account=xxx
 *
 * Public (no auth) — returns the merged tracking + submission row for the given
 * account so the user dashboard can display their own status after submitting.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const account = req.nextUrl.searchParams.get('account')?.trim();
  if (!account) return NextResponse.json({ message: 'account required' }, { status: 400 });

  const trackingRows = readActive();
  const submissions  = findAll();

  // Parse device info from each submission
  const parsedSubs = submissions.map(s => {
    let deviceSerial = s.deviceSerial ?? null;
    let deviceName   = s.deviceName   ?? null;
    if (!deviceSerial || !deviceName) {
      try {
        const r = JSON.parse(s.validationResult ?? '{}') as { deviceSerial?: string; deviceName?: string };
        deviceSerial ??= r.deviceSerial ?? null;
        deviceName   ??= r.deviceName   ?? null;
      } catch { /* ignore */ }
    }
    return { ...s, deviceSerial, deviceName };
  });

  // Find the most recent submission for this account
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
  const normAccount = norm(account);

  const userSubs = parsedSubs
    .filter(s => norm(s.account) === normAccount)
    .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());

  const latestSub = userSubs[0] ?? null;

  // Find matching tracking row
  const trackingRow = trackingRows.find(r =>
    latestSub
      ? matchesTrackingRow(r, latestSub.deviceSerial, latestSub.deviceName, account)
      : norm(r.account) === normAccount || norm(r.email) === normAccount
  ) ?? null;

  return NextResponse.json({
    no:               trackingRow?.no ?? null,
    project:          trackingRow?.project ?? null,
    name:             trackingRow?.name ?? null,
    email:            trackingRow?.email ?? null,
    serial:           trackingRow?.serial ?? null,
    trackingAccount:  trackingRow?.account ?? null,
    deviceType:       trackingRow?.deviceType ?? null,
    malwareAlerts:    trackingRow?.malwareAlerts ?? null,
    complianceChecks: trackingRow?.complianceChecks ?? null,
    seedConfiguration:trackingRow?.seedConfiguration ?? null,
    operatingSystem:  trackingRow?.operatingSystem ?? null,
    trackingStatus:   trackingRow?.trackingStatus ?? null,
    // submission
    submissionId:     latestSub?.id ?? null,
    account:          latestSub?.account ?? account,
    submissionType:   latestSub?.submissionType ?? null,
    submissionStatus: latestSub?.status ?? null,
    submissionDate:   latestSub?.submissionDate ?? null,
    imageUrl:         latestSub?.imageUrl ?? null,
    confidenceScore:  latestSub?.confidenceScore ?? null,
  });
}
