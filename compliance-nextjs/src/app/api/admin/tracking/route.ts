import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { trackingFilePath } from '@/lib/utils/tracking-path';
import { readTrackingRows } from '@/lib/services/tracking-reader';
import { findAll } from '@/lib/db/submission-repo';
import type { Submission } from '@/lib/storage/json-storage';
import { readAll as readTrackingDB, readActive as readActiveTrackingDB, replaceAll, mergeFromUpload, updateSeedFields } from '@/lib/db/tracking-repo';
import type { TrackingMember } from '@/lib/db/tracking-repo';
import { matchesTrackingRow } from '@/lib/db/tracking-repo';
import { bumpTrackingVersionAsync as bumpTrackingVersion } from '@/lib/db/index';
import { getImageBuffer } from '@/lib/utils/file-storage';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

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
  // Parse AI identifiers from each submission's validationResult (same as user-list route)
  const parsedSubs = submissions.map(s => {
    let deviceSerial: string | null = s.deviceSerial ?? null;
    let deviceName: string | null = s.deviceName ?? null;
    if (!deviceSerial || !deviceName) {
      try {
        const r = JSON.parse(s.validationResult ?? '{}') as { deviceSerial?: string; deviceName?: string };
        deviceSerial ??= r.deviceSerial ?? null;
        deviceName   ??= r.deviceName  ?? null;
      } catch { /* ignore */ }
    }
    return { ...s, deviceSerial, deviceName };
  });

  const result = new Map<number, string>();

  for (const row of trackingRows) {
    const matches = parsedSubs.filter(s =>
      matchesTrackingRow(row, s.deviceSerial, s.deviceName, s.account)
    );
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
}

interface FilteredExportBody {
  month?: number;
  year?: number;
  members: FilteredMember[];
}

/** Sanitize a name for use in a filename — preserves spaces. */
function sanitizeName(name: string): string {
  return name
    .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * GET /api/admin/tracking
 *   - Generate and download tracking.xlsx from DB rows
 *   - Filtered ZIP exports are handled exclusively by POST
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const rows = await readActiveTrackingDB();
  if (rows.length === 0) {
    // Fall back to disk file if DB is empty (migration hasn't run yet)
    const diskPath = trackingFilePath();
    if (fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="tracking.xlsx"',
          'Content-Length': String(buf.length),
        },
      });
    }
    return NextResponse.json({ message: 'Tracking data not found on server' }, { status: 404 });
  }

  // Build tracking-row-id → best submission status map
  const allSubmissions = await findAll();
  const rowIdToStatus = buildRowStatusMap(rows, allSubmissions);

  // Generate fresh xlsx from DB rows
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');

  // Header row
  sheet.addRow(['No', 'Project', 'Name', 'Email', 'Serial', 'Account', 'Device Type',
    'Malware Alerts', 'Compliance Checks', 'Seed Configuration', 'Operating System',
    'Follow Up Action', 'Response From Ticket', 'Tracking Status']);

  for (const r of rows) {
    sheet.addRow([
      r.no ?? '', r.project ?? '', r.name ?? '', r.email ?? '', r.serial ?? '',
      r.account ?? '', r.deviceType ?? '', r.malwareAlerts ?? '', r.complianceChecks ?? '',
      r.seedConfiguration ?? '', r.operatingSystem ?? '', r.followUpAction ?? '',
      r.responseFromTicket ?? '', deriveTrackingStatus(rowIdToStatus.get(r.id)),
    ]);
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="tracking.xlsx"',
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
    const { month, year, members } = body;

    if (!members || !Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ message: 'No members provided' }, { status: 400 });
    }

    const allSubmissions = await findAll();
    const submissionById = new Map(allSubmissions.map(s => [s.id, s]));

    const hasDate = month !== undefined && year !== undefined &&
      !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;

    const monthName = hasDate ? MONTH_NAMES[month - 1] : 'export';
    const baseName  = hasDate ? `tracking_${monthName}_${year}` : 'tracking_export';
    const zip = new AdmZip();

    // Build filtered tracking xlsx from DB rows
    {
      const allDbRows = await readActiveTrackingDB();
      const memberIdSet = new Set(members.filter(m => m.trackingRowNum).map(m => m.trackingRowNum as number));
      const idToMember = new Map(members.filter(m => m.trackingRowNum).map(m => [m.trackingRowNum as number, m]));
      const filteredDbRows = allDbRows.filter(r => memberIdSet.has(r.id));

      if (filteredDbRows.length > 0) {
        const outWb = new ExcelJS.Workbook();
        const outSheet = outWb.addWorksheet('Sheet1');
        outSheet.addRow(['No', 'Project', 'Name', 'Email', 'Serial', 'Account', 'Device Type',
          'Malware Alerts', 'Compliance Checks', 'Seed Configuration', 'Operating System',
          'Follow Up Action', 'Response From Ticket', 'Tracking Status']);
        for (const r of filteredDbRows) {
          const m = idToMember.get(r.id);
          const sub = m?.submissionId ? submissionById.get(m.submissionId) : undefined;
          outSheet.addRow([
            m?.no ?? r.no ?? '', r.project ?? '', r.name ?? '', r.email ?? '',
            r.serial ?? '', r.account ?? '', r.deviceType ?? '',
            r.malwareAlerts ?? '', r.complianceChecks ?? '', r.seedConfiguration ?? '',
            r.operatingSystem ?? '', r.followUpAction ?? '', r.responseFromTicket ?? '',
            deriveTrackingStatus(sub?.status),
          ]);
        }
        const xlsxBuf = await outWb.xlsx.writeBuffer();
        zip.addFile(`${baseName}.xlsx`, Buffer.from(xlsxBuf));
      }
    }

    const periodSubs = hasDate
      ? allSubmissions.filter(s => {
          if (!s.submissionDate) return false;
          const d = new Date(s.submissionDate);
          return d.getMonth() + 1 === month && d.getFullYear() === year;
        })
      : allSubmissions;
    const periodSubsByAccount = new Map(periodSubs.map(s => [s.account?.toLowerCase() ?? '', s]));
    const periodSubsById = new Map(periodSubs.map(s => [s.id, s]));

    for (const member of members) {
      let sub = member.submissionId
        ? periodSubsById.get(member.submissionId) ?? submissionById.get(member.submissionId)
        : undefined;

      if (!sub && member.account) {
        sub = periodSubsByAccount.get(member.account.toLowerCase());
      }

      if (!sub?.imageSavedName) continue;

      const imgBuf = await getImageBuffer(sub.imageSavedName);
      if (!imgBuf) continue;

      const ext = path.extname(sub.imageSavedName).toLowerCase() || '.png';
      const nn  = String(member.no).padStart(2, '0');
      const safeName = sanitizeName(member.name) || `member_${nn}`;
      const fileName = `${nn}_${safeName}${ext}`;

      zip.addFile(`images/${fileName}`, imgBuf);
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
