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

/**
 * GET /api/admin/tracking
 *   - No params  → download tracking.xlsx
 *   - ?month=4&year=2026 → download ZIP: tracking_Month_Year.xlsx + images/
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params  = req.nextUrl.searchParams;
  const monthP  = params.get('month');
  const yearP   = params.get('year');
  const month   = monthP ? parseInt(monthP, 10) : NaN;
  const year    = yearP  ? parseInt(yearP,  10) : NaN;
  const hasDate = !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;

  const filePath = existingTrackingPath();

  if (!hasDate) {
    // Plain xlsx download
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

  // ZIP download: tracking.xlsx + images from that month/year
  const monthName = MONTH_NAMES[month - 1];
  const baseName  = `tracking_${monthName}_${year}`;
  const zip = new AdmZip();

  // Add tracking.xlsx if present
  if (filePath) {
    zip.addFile(`${baseName}.xlsx`, fs.readFileSync(filePath));
  }

  // Add images for submissions from that month/year
  const submissions = findAll().filter(s => {
    if (!s.submissionDate) return false;
    const d = new Date(s.submissionDate);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  for (const sub of submissions) {
    if (!sub.imageSavedName) continue;
    const imgBuf = await getImageBuffer(sub.imageSavedName);
    if (imgBuf) zip.addFile(`images/${sub.imageSavedName}`, imgBuf);
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
}

/** POST /api/admin/tracking — replace tracking.xlsx with uploaded file */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls'))
      return NextResponse.json({ message: 'Only .xlsx files are accepted' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    if (!isXlsxBuffer(buf))
      return NextResponse.json({ message: 'File does not appear to be a valid Excel (.xlsx) file' }, { status: 400 });

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
