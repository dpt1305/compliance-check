import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { trackingFilePath, existingTrackingPath } from '@/lib/utils/tracking-path';
import { buildColumnMap } from '@/lib/services/tracking-reader';
import { findAll } from '@/lib/storage/json-storage';
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
 *   - Always download the full tracking.xlsx
 *   - Filtered ZIP exports are handled exclusively by POST
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const filePath = existingTrackingPath();

  if (!filePath) return NextResponse.json({ message: 'Tracking file not found on server' }, { status: 404 });

  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
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

      const dest = trackingFilePath();
      const dir  = path.dirname(dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dest, buf);

      return NextResponse.json({ message: 'Tracking file updated successfully', path: path.basename(dest), size: buf.length });
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

    const hasDate = month !== undefined && year !== undefined &&
      !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;

    const monthName = hasDate ? MONTH_NAMES[month - 1] : 'export';
    const baseName  = hasDate ? `tracking_${monthName}_${year}` : 'tracking_export';
    const zip = new AdmZip();

    const filePath = existingTrackingPath();
    if (filePath) {
      const sourceWb = new ExcelJS.Workbook();
      await sourceWb.xlsx.readFile(filePath);
      const sourceSheet = sourceWb.worksheets[0];
      const cols = buildColumnMap(sourceSheet);

      const outWb = new ExcelJS.Workbook();
      const outSheet = outWb.addWorksheet('Sheet1');

      const headerRow = sourceSheet.getRow(1);
      const maxCol = sourceSheet.columnCount || 20;
      const outHeader = outSheet.addRow([]);
      for (let c = 1; c <= maxCol; c++) {
        const cell = headerRow.getCell(c);
        outHeader.getCell(c).value = cell.value;
        outHeader.getCell(c).font = cell.font;
        outHeader.getCell(c).fill = cell.fill as ExcelJS.Fill;
        outHeader.getCell(c).border = cell.border;
      }
      outHeader.commit();

      const memberRowNumSet = new Set(members.filter(m => m.trackingRowNum).map(m => m.trackingRowNum as number));
      const rowNumToMember = new Map(members.filter(m => m.trackingRowNum).map(m => [m.trackingRowNum as number, m]));

      sourceSheet.eachRow((srcRow, rowNum) => {
        if (rowNum === 1) return;
        if (!memberRowNumSet.has(rowNum)) return;

        const member = rowNumToMember.get(rowNum);
        if (!member) return;

        const outRow = outSheet.addRow([]);
        for (let c = 1; c <= maxCol; c++) {
          const srcCell = srcRow.getCell(c);
          const outCell = outRow.getCell(c);
          if (c === cols.no) {
            outCell.value = member.no;
          } else {
            outCell.value = srcCell.value;
          }
          outCell.font = srcCell.font;
          outCell.fill = srcCell.fill as ExcelJS.Fill;
          outCell.border = srcCell.border;
        }
        outRow.commit();
      });

      for (let c = 1; c <= maxCol; c++) {
        const srcCol = sourceSheet.getColumn(c);
        const outCol = outSheet.getColumn(c);
        if (srcCol.width) outCol.width = srcCol.width;
      }

      const xlsxBuf = await outWb.xlsx.writeBuffer();
      zip.addFile(`${baseName}.xlsx`, Buffer.from(xlsxBuf));
    }

    const allSubmissions = findAll();
    const submissionById = new Map(allSubmissions.map(s => [s.id, s]));

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

/** PUT /api/admin/tracking — update a single row using dynamic column detection */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as TrackingUpdateBody;
    const { rowNum, malwareAlerts, complianceChecks, seedConfiguration, operatingSystem, followUpAction, trackingStatus } = body;

    if (!rowNum || rowNum < 2) return NextResponse.json({ message: 'Invalid rowNum' }, { status: 400 });

    const filePath = existingTrackingPath();
    if (!filePath) return NextResponse.json({ message: 'Tracking file not found on server' }, { status: 404 });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    const cols  = buildColumnMap(sheet);
    const row   = sheet.getRow(rowNum);

    if (malwareAlerts    !== undefined) row.getCell(cols.malwareAlerts).value    = malwareAlerts;
    if (complianceChecks !== undefined) row.getCell(cols.complianceChecks).value = complianceChecks;
    if (seedConfiguration!== undefined) row.getCell(cols.seedConfig).value       = seedConfiguration;
    if (operatingSystem  !== undefined) row.getCell(cols.os).value               = operatingSystem;
    if (followUpAction   !== undefined) row.getCell(cols.followUp).value         = followUpAction;
    if (trackingStatus   !== undefined) row.getCell(cols.status).value           = trackingStatus;

    row.commit();
    await workbook.xlsx.writeFile(filePath);

    return NextResponse.json({ message: 'Tracking row updated' });
  } catch (err) {
    console.error('[tracking-update] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Update failed' }, { status: 500 });
  }
}
