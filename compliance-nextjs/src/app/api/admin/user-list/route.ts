import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { findAll } from '@/lib/storage/json-storage';
import { readTrackingRows, matchesTrackingRow, buildColumnMap, cellText } from '@/lib/services/tracking-reader';
import { existingTrackingPath } from '@/lib/utils/tracking-path';

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

interface AddMemberBody {
  project?: string;
  name?: string;
  email?: string;
  serial?: string;
  account?: string;
  deviceType?: string;
}

interface UpdateMemberBody {
  rowNum?: number;
  project?: string;
  name?: string;
  email?: string;
  serial?: string;
  account?: string;
  deviceType?: string;
  trackingStatus?: string;
}

function trimValue(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

let trackingWriteQueue: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTrackingLockedError(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  const code = String(e?.code ?? '');
  const msg = String(e?.message ?? '').toLowerCase();
  return (
    code === 'EBUSY' ||
    code === 'EPERM' ||
    code === 'EACCES' ||
    msg.includes('resource busy') ||
    msg.includes('locked') ||
    msg.includes('used by another process')
  );
}

async function withTrackingWriteLock<T>(op: () => Promise<T>): Promise<T> {
  const run = trackingWriteQueue.then(op, op);
  trackingWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function withLockedFileRetry<T>(op: () => Promise<T>, retries = 5, waitMs = 120): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isTrackingLockedError(err) || attempt === retries) throw err;
      await delay(waitMs * (attempt + 1));
    }
  }
  throw lastErr;
}

function nextNo(sheet: ExcelJS.Worksheet, noCol: number): number {
  if (noCol < 1) return Math.max(sheet.rowCount, 1);
  let maxNo = 0;
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const n = Number(cellText(row, noCol));
    if (!isNaN(n) && n > maxNo) maxNo = n;
  });
  return maxNo + 1;
}

function setCellIfPresent(row: ExcelJS.Row, col: number, value: string | number): void {
  if (col > 0) row.getCell(col).value = value;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as AddMemberBody;
    const name = trimValue(body.name);
    if (!name) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }

    const email = trimValue(body.email);
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ message: 'Email is invalid' }, { status: 400 });
    }

    const filePath = existingTrackingPath();
    if (!filePath) {
      return NextResponse.json({ message: 'Tracking file not found on server' }, { status: 404 });
    }

    let createdRowNum = 0;
    await withTrackingWriteLock(async () => {
      await withLockedFileRetry(async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('Tracking sheet is missing');

        const cols = buildColumnMap(sheet);
        const autoNo = nextNo(sheet, cols.no);

        const row = sheet.addRow([]);
        setCellIfPresent(row, cols.no, autoNo);
        setCellIfPresent(row, cols.project, trimValue(body.project));
        setCellIfPresent(row, cols.name, name);
        setCellIfPresent(row, cols.email, email);
        setCellIfPresent(row, cols.serial, trimValue(body.serial));
        setCellIfPresent(row, cols.account, trimValue(body.account));
        setCellIfPresent(row, cols.type, trimValue(body.deviceType));
        setCellIfPresent(row, cols.malwareAlerts, '');
        setCellIfPresent(row, cols.complianceChecks, '');
        setCellIfPresent(row, cols.seedConfig, '');
        setCellIfPresent(row, cols.os, '');
        setCellIfPresent(row, cols.followUp, 'Default');
        setCellIfPresent(row, cols.response, 'Refer photo captured in folder');
        setCellIfPresent(row, cols.status, 'Ok');
        row.commit();

        await workbook.xlsx.writeFile(filePath);
        createdRowNum = row.number;
      });
    });

    return NextResponse.json({
      message: 'Member added successfully',
      rowNum: createdRowNum,
    }, { status: 201 });
  } catch (err) {
    if (isTrackingLockedError(err)) {
      return NextResponse.json(
        { message: 'tracking.xlsx is locked by another process. Please close the file and try again.' },
        { status: 423 }
      );
    }
    console.error('[user-list-add-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to add member' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as UpdateMemberBody;
    const rowNum = Number(body.rowNum);
    if (!rowNum || rowNum < 2) {
      return NextResponse.json({ message: 'Valid rowNum is required' }, { status: 400 });
    }

    const name = body.name !== undefined ? trimValue(body.name) : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ message: 'Name cannot be empty' }, { status: 400 });
    }

    const email = body.email !== undefined ? trimValue(body.email) : undefined;
    if (email !== undefined && email && !isValidEmail(email)) {
      return NextResponse.json({ message: 'Email is invalid' }, { status: 400 });
    }

    const filePath = existingTrackingPath();
    if (!filePath) {
      return NextResponse.json({ message: 'Tracking file not found on server' }, { status: 404 });
    }

    await withTrackingWriteLock(async () => {
      await withLockedFileRetry(async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('Tracking sheet is missing');

        if (rowNum > sheet.rowCount) throw new Error(`Tracking row not found: ${rowNum}`);

        const cols = buildColumnMap(sheet);
        const row = sheet.getRow(rowNum);
        if (!cellText(row, cols.name)) throw new Error(`Tracking row not found: ${rowNum}`);

        if (body.project !== undefined)      setCellIfPresent(row, cols.project, trimValue(body.project));
        if (name !== undefined)              setCellIfPresent(row, cols.name, name);
        if (email !== undefined)             setCellIfPresent(row, cols.email, email);
        if (body.serial !== undefined)       setCellIfPresent(row, cols.serial, trimValue(body.serial));
        if (body.account !== undefined)      setCellIfPresent(row, cols.account, trimValue(body.account));
        if (body.deviceType !== undefined)   setCellIfPresent(row, cols.type, trimValue(body.deviceType));
        if (body.trackingStatus !== undefined) setCellIfPresent(row, cols.status, trimValue(body.trackingStatus));

        row.commit();
        await workbook.xlsx.writeFile(filePath);
      });
    });

    return NextResponse.json({ message: 'Member updated successfully', rowNum });
  } catch (err) {
    if (isTrackingLockedError(err)) {
      return NextResponse.json(
        { message: 'tracking.xlsx is locked by another process. Please close the file and try again.' },
        { status: 423 }
      );
    }
    const msg = (err as Error).message;
    if (msg.startsWith('Tracking row not found:')) return NextResponse.json({ message: msg }, { status: 404 });
    console.error('[user-list-update-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const rowNum = Number(req.nextUrl.searchParams.get('rowNum'));
    if (!rowNum || rowNum < 2) {
      return NextResponse.json({ message: 'Valid rowNum is required' }, { status: 400 });
    }

    const filePath = existingTrackingPath();
    if (!filePath) {
      return NextResponse.json({ message: 'Tracking file not found on server' }, { status: 404 });
    }

    await withTrackingWriteLock(async () => {
      await withLockedFileRetry(async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('Tracking sheet is missing');

        if (rowNum > sheet.rowCount) throw new Error(`Tracking row not found: ${rowNum}`);

        const cols = buildColumnMap(sheet);
        const row = sheet.getRow(rowNum);
        if (!cellText(row, cols.name)) throw new Error(`Tracking row not found: ${rowNum}`);

        sheet.spliceRows(rowNum, 1);

        if (cols.no > 0) {
          for (let i = 2; i <= sheet.rowCount; i++) {
            const current = sheet.getRow(i);
            if (cellText(current, cols.name)) {
              current.getCell(cols.no).value = i - 1;
              current.commit();
            }
          }
        }

        await workbook.xlsx.writeFile(filePath);
      });
    });

    return NextResponse.json({ message: 'Member deleted successfully', rowNum });
  } catch (err) {
    if (isTrackingLockedError(err)) {
      return NextResponse.json(
        { message: 'tracking.xlsx is locked by another process. Please close the file and try again.' },
        { status: 423 }
      );
    }
    const msg = (err as Error).message;
    if (msg.startsWith('Tracking row not found:')) return NextResponse.json({ message: msg }, { status: 404 });
    console.error('[user-list-delete-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to delete member' }, { status: 500 });
  }
}
