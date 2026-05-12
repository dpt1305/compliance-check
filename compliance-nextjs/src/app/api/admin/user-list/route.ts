import { NextResponse } from 'next/server';
import { findAll } from '@/lib/storage/json-storage';
import { readTrackingRows, matchesTrackingRow } from '@/lib/services/tracking-reader';

export interface UserListEntry {
  // Source: 'tracking' | 'submission' | 'both'
  source: 'tracking' | 'submission' | 'both';

  // From tracking.xlsx
  trackingRowNum?: number;
  trackingNo?: number | null;
  project?: string;
  name: string;
  email?: string;
  serial?: string;
  trackingAccount?: string;   // "Account" column from tracking.xlsx (if present)
  deviceType?: string;
  // SEED values currently in tracking.xlsx
  malwareAlerts?: string;
  complianceChecks?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  followUpAction?: string;
  responseFromTicket?: string;
  trackingStatus?: string;

  // From submission (if matched)
  submissionId?: number;
  account?: string;
  submissionType?: string;
  submissionStatus?: string;
  submissionDate?: string;
  imageUrl?: string;
  confidenceScore?: number;
  deviceSerial?: string;
  deviceName?: string;
}

export async function GET(): Promise<NextResponse> {
  const [trackingRows, submissions] = await Promise.all([
    readTrackingRows(),
    Promise.resolve(findAll()),
  ]);

  // Parse AI identifiers from each submission's validationResult
  const parsedSubs = submissions.map(s => {
    let deviceSerial: string | null = s.deviceSerial ?? null;
    let deviceName: string | null = s.deviceName ?? null;
    if (!deviceSerial || !deviceName) {
      try {
        const r = JSON.parse(s.validationResult ?? '{}') as { deviceSerial?: string; deviceName?: string };
        deviceSerial ??= r.deviceSerial ?? null;
        deviceName  ??= r.deviceName  ?? null;
      } catch { /* ignore */ }
    }
    return { ...s, deviceSerial, deviceName };
  });

  const entries: UserListEntry[] = [];
  const matchedSubmissionIds = new Set<number>();

  // For each tracking row, find a matching submission
  for (const row of trackingRows) {
    const match = parsedSubs.find(s =>
      !matchedSubmissionIds.has(s.id) &&
      matchesTrackingRow(row, s.deviceSerial, s.deviceName, s.account)
    );

    if (match) {
      matchedSubmissionIds.add(match.id);
      entries.push({
        source: 'both',
        trackingRowNum: row.rowNum,
        trackingNo: row.no,
        project: row.project,
        name: row.name,
        email: row.email,
        serial: row.serial,
        trackingAccount: row.account || undefined,
        deviceType: row.deviceType,
        malwareAlerts: row.malwareAlerts,
        complianceChecks: row.complianceChecks,
        seedConfiguration: row.seedConfiguration,
        operatingSystem: row.operatingSystem,
        followUpAction: row.followUpAction,
        responseFromTicket: row.responseFromTicket,
        trackingStatus: row.trackingStatus,
        submissionId: match.id,
        account: match.account,
        submissionType: match.submissionType,
        submissionStatus: match.status,
        submissionDate: match.submissionDate,
        imageUrl: match.imageUrl,
        confidenceScore: match.confidenceScore,
        deviceSerial: match.deviceSerial ?? undefined,
        deviceName: match.deviceName ?? undefined,
      });
    } else {
      // In tracking.xlsx but no submission yet
      entries.push({
        source: 'tracking',
        trackingRowNum: row.rowNum,
        trackingNo: row.no,
        project: row.project,
        name: row.name,
        email: row.email,
        serial: row.serial,
        trackingAccount: row.account || undefined,
        deviceType: row.deviceType,
        malwareAlerts: row.malwareAlerts,
        complianceChecks: row.complianceChecks,
        seedConfiguration: row.seedConfiguration,
        operatingSystem: row.operatingSystem,
        followUpAction: row.followUpAction,
        responseFromTicket: row.responseFromTicket,
        trackingStatus: row.trackingStatus,
        submissionStatus: 'NOT_SUBMITTED',
      });
    }
  }

  // Submissions that don't match any tracking row (submitted but not in tracking.xlsx)
  for (const s of parsedSubs) {
    if (!matchedSubmissionIds.has(s.id)) {
      entries.push({
        source: 'submission',
        name: s.deviceName ?? s.account,
        account: s.account,
        submissionId: s.id,
        submissionType: s.submissionType,
        submissionStatus: s.status,
        submissionDate: s.submissionDate,
        imageUrl: s.imageUrl,
        confidenceScore: s.confidenceScore,
        deviceSerial: s.deviceSerial ?? undefined,
        deviceName: s.deviceName ?? undefined,
        malwareAlerts: s.malwareAlerts,
        complianceChecks: s.complianceCheck,
        seedConfiguration: s.seedConfiguration,
        operatingSystem: s.operatingSystem,
      });
    }
  }

  return NextResponse.json(entries);
}
