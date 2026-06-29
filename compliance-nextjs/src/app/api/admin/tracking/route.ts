import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { COOKIE_NAME, extractBearerToken, verifyToken } from '@/lib/auth/jwt';
import { findByUsername } from '@/lib/db/admin-repo';
import { exportFollowUpAction, exportIssueCount } from '@/lib/services/excel-export';
import { getUserListData, type UserListEntry } from '@/lib/services/admin-user-list';
import { trackingFilePath } from '@/lib/utils/tracking-path';
import { readTrackingRows } from '@/lib/services/tracking-reader';
import { findAll, findByIds } from '@/lib/db/submission-repo';
import type { Submission } from '@/lib/storage/json-storage';
import { buildSubmissionMatchIndex, getMatchesForTrackingRow } from '@/lib/services/admin-user-list';
import { readAll as readTrackingDB, readActive as readActiveTrackingDB, replaceAll, mergeFromUpload, updateSeedFields } from '@/lib/db/tracking-repo';
import type { TrackingMember } from '@/lib/db/tracking-repo';
import { bumpTrackingVersionAsync as bumpTrackingVersion } from '@/lib/db/index';
import { getImageBuffer } from '@/lib/utils/file-storage';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function trackingExportBaseName(month: number, year: number): string {
  return `SDC_IT compliance report_${MONTH_NAMES[month - 1]}_${year}`;
}

function currentBangkokMonthYear(): { month: number; year: number } {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
  );
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function isXlsxBuffer(buf: Buffer): boolean {
  return buf.length >= 4 &&
    buf[0] === 0x50 && buf[1] === 0x4B &&
    buf[2] === 0x03 && buf[3] === 0x04;
}

/**
 * Derive the Tracking Status cell value from a submission's status:
 *   APPROVED → "OK"
 *   REJECTED → "Rejected"
 *   anything else (PENDING / no submission) → "Rejected"
 */
function deriveTrackingStatus(submissionStatus: string | null | undefined): string {
  if (submissionStatus?.toUpperCase() === 'APPROVED') return 'OK';
  return 'Rejected';
}

/**
 * Build a map of tracking-row DB id → best submission status for use in exports.
 * "Best" = most recent; APPROVED always wins over PENDING/REJECTED for the same row.
 */
function buildRowStatusMap(
  trackingRows: TrackingMember[],
  submissions: Submission[],
): Map<number, string> {
  const matchIndex = buildSubmissionMatchIndex(submissions);
  const result = new Map<number, string>();

  for (const row of trackingRows) {
    const matches = getMatchesForTrackingRow(row, matchIndex);
    if (matches.length === 0) continue;

    // Pick most recent submission; APPROVED beats any other status
    const best = matches.sort((a, b) =>
      new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime()
    ).find(s => s.status === 'APPROVED') ?? matches[0];

    result.set(row.id, best.status);
  }

  return result;
}

interface FilteredMember {
  no: number;
  name: string;
  trackingRowNum?: number;
  account?: string;
  submissionId?: number;
  submissionStatus?: string;
  project?: string;
  email?: string;
  serial?: string;
  deviceType?: string;
  malwareAlerts?: string;
  complianceChecks?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  followUpAction?: string;
  responseFromTicket?: string;
}

interface FilteredExportBody {
  month?: number;
  year?: number;
  projects?: string[] | null;
  tags?: string[];
  sortCol?: string;
  sortDir?: 'asc' | 'desc';
  members?: FilteredMember[];
}

/** Sanitize a name for use in a filename — preserves spaces. */
function sanitizeName(name: string): string {
  return name
    .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60);
}

async function resolveCallerScope(req: NextRequest): Promise<{ callerRole: string; callerTeams: string[] }> {
  const bearerToken = extractBearerToken(req.headers.get('authorization'));
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value ?? null;
  const token = bearerToken ?? cookieToken;
  const callerUsername = token ? await verifyToken(token) : null;

  let callerRole = 'Admin';
  let callerTeams: string[] = [];
  if (callerUsername) {
    const caller = await findByUsername(callerUsername);
    if (caller) {
      callerRole = caller.role ?? 'Admin';
      try {
        callerTeams = JSON.parse(caller.teams ?? '[]') as string[];
      } catch {
        callerTeams = [];
      }
    }
  }

  return { callerRole, callerTeams };
}

function mapEntriesToFilteredMembers(items: UserListEntry[]): FilteredMember[] {
  return items.map((row, index) => ({
    no: index + 1,
    name: row.name,
    trackingRowNum: row.trackingRowNum,
    account: row.trackingAccount ?? row.account,
    submissionId: row.submissionId,
    submissionStatus: row.submissionStatus,
    project: row.project,
    email: row.email,
    serial: row.serial ?? row.deviceSerial,
    deviceType: row.deviceType ?? row.submissionType,
    malwareAlerts: row.malwareAlerts,
    complianceChecks: row.complianceChecks,
    seedConfiguration: row.seedConfiguration,
    operatingSystem: row.operatingSystem,
    followUpAction: row.followUpAction,
    responseFromTicket: row.responseFromTicket,
  }));
}

async function buildFilteredMembers(req: NextRequest, body: FilteredExportBody): Promise<FilteredMember[]> {
  if (Array.isArray(body.members) && body.members.length > 0) {
    return body.members;
  }

  const { callerRole, callerTeams } = await resolveCallerScope(req);
  const { items } = await getUserListData({
    projects: body.projects ?? null,
    month: body.month ?? null,
    year: body.year ?? null,
    tags: body.tags ?? [],
    callerRole,
    callerTeams,
    sortCol: body.sortCol,
    sortDir: body.sortDir ?? 'asc',
  });

  return mapEntriesToFilteredMembers(items);
}

/**
 * GET /api/admin/tracking
 *   - Generate and download tracking.xlsx from DB rows
 *   - Filtered ZIP exports are handled exclusively by POST
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const monthParam = parseInt(req.nextUrl.searchParams.get('month') ?? '', 10);
  const yearParam = parseInt(req.nextUrl.searchParams.get('year') ?? '', 10);
  const hasPeriod =
    !Number.isNaN(monthParam) &&
    !Number.isNaN(yearParam) &&
    monthParam >= 1 &&
    monthParam <= 12 &&
    yearParam > 0;
  const { month, year } = hasPeriod
    ? { month: monthParam, year: yearParam }
    : currentBangkokMonthYear();
  const fileName = `${trackingExportBaseName(month, year)}.xlsx`;

  const [rows, allSubmissions] = await Promise.all([
    readActiveTrackingDB(),
    findAll(),
  ]);
  if (rows.length === 0) {
    // Fall back to disk file if no tracking rows are available in the active data store yet.
    const diskPath = trackingFilePath();
    if (fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': String(buf.length),
        },
      });
    }
    return NextResponse.json({ message: 'Tracking data not found on server' }, { status: 404 });
  }

  // Build tracking-row-id → best submission status map
  const rowIdToStatus = buildRowStatusMap(rows, allSubmissions);

  // Generate fresh xlsx from DB rows
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');

  // Header row
  sheet.addRow(['No.', 'Project', 'Name', 'Account', 'Mail NCS', 'Serial Number', 'Type',
    'Malware Alerts', 'Compliance Checks/Trellix', 'SEED Configuration', 'Operating System',
    'Follow up action', 'EVD / Ticket', 'Status', 'Note']);

  for (const r of rows) {
    sheet.addRow([
      r.no ?? '', r.project ?? '', r.name ?? '', r.account ?? '', r.email ?? '', r.serial ?? '',
      r.deviceType ?? '', exportIssueCount(r.malwareAlerts), exportIssueCount(r.complianceChecks),
      exportIssueCount(r.seedConfiguration), exportIssueCount(r.operatingSystem), exportFollowUpAction(r.followUpAction),
      'Refer photo captured in folder',
      deriveTrackingStatus(rowIdToStatus.get(r.id)),
      '',
    ]);
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buf.length),
    },
  });
}

/**
 * POST /api/admin/tracking
 *   - multipart/form-data  → replace tracking.xlsx with uploaded file (existing behavior)
 *   - application/json     → filtered ZIP export: { month?, year?, members: [...] }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });

      const name = file.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
        return NextResponse.json({ message: 'Only .xlsx files are accepted' }, { status: 400 });
      }

      const buf = Buffer.from(await file.arrayBuffer());
      if (!isXlsxBuffer(buf)) {
        return NextResponse.json({ message: 'File does not appear to be a valid Excel (.xlsx) file' }, { status: 400 });
      }

      // Also save to disk (fallback / backup)
      const dest = trackingFilePath();
      const dir  = path.dirname(dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dest, buf);

      // Parse and import into DB using smart merge (preserves seed fields, keeps removed members)
      const parsed = await readTrackingRows(dest);
      const { inserted, updated, preserved } = await mergeFromUpload(parsed.map(r => ({
        no:                 r.no ?? undefined,
        project:            r.project || undefined,
        name:               r.name,
        email:              r.email || undefined,
        serial:             r.serial || undefined,
        account:            r.account || undefined,
        deviceType:         r.deviceType || undefined,
        malwareAlerts:      r.malwareAlerts || undefined,
        complianceChecks:   r.complianceChecks || undefined,
        seedConfiguration:  r.seedConfiguration || undefined,
        operatingSystem:    r.operatingSystem || undefined,
        followUpAction:     r.followUpAction || undefined,
        responseFromTicket: r.responseFromTicket || undefined,
        trackingStatus:     r.trackingStatus || undefined,
      })));
      await bumpTrackingVersion();

      return NextResponse.json({
        message: 'Tracking file updated successfully',
        path: path.basename(dest),
        size: buf.length,
        rows: parsed.length,
        inserted,
        updated,
        preserved,
      });
    } catch (err) {
      console.error('[tracking-upload] Failed:', (err as Error).message);
      return NextResponse.json({ message: 'Upload failed' }, { status: 500 });
    }
  }

  try {
    const body = await req.json() as FilteredExportBody;
    const { month, year } = body;
    const members = await buildFilteredMembers(req, body);

    if (members.length === 0) {
      return NextResponse.json({ message: 'No members provided' }, { status: 400 });
    }

    const hasDate = month !== undefined && year !== undefined &&
      !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;

    const { month: exportMonth, year: exportYear } = hasDate
      ? { month, year }
      : currentBangkokMonthYear();
    const baseName = trackingExportBaseName(exportMonth, exportYear);
    const zip = new AdmZip();
    const submissionIds = [...new Set(
      members
        .map(member => member.submissionId)
        .filter((submissionId): submissionId is number => typeof submissionId === 'number' && submissionId > 0)
    )];
    const selectedSubmissions = await findByIds(submissionIds);
    const submissionById = new Map(selectedSubmissions.map(submission => [submission.id, submission]));

    if (members.length > 0) {
      const outWb = new ExcelJS.Workbook();
      const outSheet = outWb.addWorksheet('Sheet1');
      outSheet.addRow(['No.', 'Project', 'Name', 'Account', 'Mail NCS', 'Serial Number', 'Type',
        'Malware Alerts', 'Compliance Checks/Trellix', 'SEED Configuration', 'Operating System',
        'Follow up action', 'EVD / Ticket', 'Status', 'Note']);
      for (const member of members) {
        const sub = member.submissionId ? submissionById.get(member.submissionId) : undefined;
        outSheet.addRow([
          member.no,
          member.project ?? '',
          member.name ?? '',
          member.account ?? '',
          member.email ?? '',
          member.serial ?? '',
          member.deviceType ?? sub?.submissionType ?? '',
          exportIssueCount(member.malwareAlerts ?? sub?.malwareAlerts),
          exportIssueCount(member.complianceChecks ?? sub?.complianceCheck),
          exportIssueCount(member.seedConfiguration ?? sub?.seedConfiguration),
          exportIssueCount(member.operatingSystem ?? sub?.operatingSystem),
          exportFollowUpAction(member.followUpAction),
          member.responseFromTicket ?? 'Refer photo captured in folder',
          deriveTrackingStatus(member.submissionStatus ?? sub?.status),
          '',
        ]);
      }
      const xlsxBuf = await outWb.xlsx.writeBuffer();
      zip.addFile(`${baseName}.xlsx`, Buffer.from(xlsxBuf));
    }

    const imageFiles = await Promise.all(members.map(async member => {
      const sub = member.submissionId ? submissionById.get(member.submissionId) : undefined;
      if (!sub?.imageSavedName) return null;

      const imgBuf = await getImageBuffer(sub.imageSavedName);
      if (!imgBuf) return null;

      const ext = path.extname(sub.imageSavedName).toLowerCase() || '.png';
      const nn = String(member.no).padStart(2, '0');
      const safeName = sanitizeName(member.name) || `member_${nn}`;
      return {
        fileName: `images/${nn}_${safeName}${ext}`,
        buffer: imgBuf,
      };
    }));

    for (const imageFile of imageFiles) {
      if (!imageFile) continue;
      zip.addFile(imageFile.fileName, imageFile.buffer);
    }

    const zipBuf = zip.toBuffer();
    return new NextResponse(zipBuf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${baseName}.zip"`,
        'Content-Length': String(zipBuf.length),
      },
    });
  } catch (err) {
    console.error('[tracking-export] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Export failed' }, { status: 500 });
  }
}

interface TrackingUpdateBody {
  rowNum: number;
  malwareAlerts?: string;
  complianceChecks?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  followUpAction?: string;
  trackingStatus?: string;
}

/** PUT /api/admin/tracking — update seed fields on a single tracking row by DB id */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as TrackingUpdateBody;
    const { rowNum, malwareAlerts, complianceChecks, seedConfiguration, operatingSystem, followUpAction, trackingStatus } = body;

    if (!rowNum || rowNum < 1) return NextResponse.json({ message: 'Invalid rowNum' }, { status: 400 });

    const ok = await updateSeedFields(rowNum, {
      ...(malwareAlerts    !== undefined && { malwareAlerts }),
      ...(complianceChecks !== undefined && { complianceChecks }),
      ...(seedConfiguration!== undefined && { seedConfiguration }),
      ...(operatingSystem  !== undefined && { operatingSystem }),
      ...(followUpAction   !== undefined && { followUpAction }),
      ...(trackingStatus   !== undefined && { trackingStatus }),
    });

    if (!ok) return NextResponse.json({ message: `Tracking row not found: ${rowNum}` }, { status: 404 });
    return NextResponse.json({ message: 'Tracking row updated' });
  } catch (err) {
    console.error('[tracking-update] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Update failed' }, { status: 500 });
  }
}
