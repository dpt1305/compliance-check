import ExcelJS from 'exceljs';
import { existingTrackingPath } from '@/lib/utils/tracking-path';

export interface TrackingRow {
  rowNum: number;
  no: number | null;
  project: string;
  name: string;
  email: string;
  serial: string;
  account: string;     // new "Account" column (empty string if column absent)
  deviceType: string;
  malwareAlerts: string;
  complianceChecks: string;
  seedConfiguration: string;
  operatingSystem: string;
  followUpAction: string;
  responseFromTicket: string;
  trackingStatus: string;
}

/** Column index map — -1 means the column is absent in this file. */
export interface ColumnMap {
  no: number;
  project: number;
  name: number;
  email: number;
  serial: number;
  account: number;        // -1 if no Account column
  type: number;
  malwareAlerts: number;
  complianceChecks: number;
  seedConfig: number;
  os: number;
  followUp: number;
  response: number;
  status: number;
}

/** Default fixed layout (original 13-column tracking.xlsx). */
const DEFAULT_COLS: ColumnMap = {
  no: 1, project: 2, name: 3, email: 4, serial: 5,
  account: -1, type: 6,
  malwareAlerts: 7, complianceChecks: 8, seedConfig: 9, os: 10,
  followUp: 11, response: 12, status: 13,
};

export function cellText(row: ExcelJS.Row, col: number): string {
  if (col < 1) return '';
  const cell = row.getCell(col);
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('').trim();
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') return ((v as { text: string }).text).trim();
    if ('result' in v) { const r = (v as ExcelJS.CellFormulaValue).result; return r != null ? String(r).trim() : ''; }
  }
  return String(v).trim();
}

function cellNumber(row: ExcelJS.Row, col: number): number | null {
  if (col < 1) return null;
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Scan the header row and return a column map.
 * Falls back to DEFAULT_COLS for any header not found.
 */
export function buildColumnMap(sheet: ExcelJS.Worksheet): ColumnMap {
  const cols = { ...DEFAULT_COLS };
  const hdr = sheet.getRow(1);
  const maxCol = Math.max(sheet.columnCount || 0, 20);

  for (let c = 1; c <= maxCol; c++) {
    const raw = cellText(hdr, c);
    if (!raw) continue;
    const h = raw.toLowerCase().replace(/\s+/g, ' ').trim();

    if (h === 'no' || h === 'no.')                              { cols.no             = c; continue; }
    if (h === 'project')                                        { cols.project         = c; continue; }
    if (h === 'name')                                           { cols.name            = c; continue; }
    if (h.includes('mail') || h.includes('email'))              { cols.email           = c; continue; }
    if (h.includes('serial'))                                   { cols.serial          = c; continue; }
    if (h === 'account' || h.startsWith('account'))             { cols.account         = c; continue; }
    if (h.includes('malware'))                                  { cols.malwareAlerts   = c; continue; }
    if (h.includes('compliance') || h.includes('trellix'))      { cols.complianceChecks= c; continue; }
    if (h.includes('seed'))                                     { cols.seedConfig      = c; continue; }
    if (h.includes('operating') || h === 'os')                  { cols.os              = c; continue; }
    if (h.includes('follow'))                                   { cols.followUp        = c; continue; }
    if (h.includes('response') || h.includes('reponse'))        { cols.response        = c; continue; }
    if (h === 'status')                                         { cols.status          = c; continue; }
    if (h.includes('type'))                                     { cols.type            = c; continue; }
  }

  return cols;
}

export async function readTrackingRows(filePath?: string): Promise<TrackingRow[]> {
  const resolvedPath = filePath ?? existingTrackingPath();
  if (!resolvedPath) return [];

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(resolvedPath);
    const sheet = workbook.worksheets[0];
    const cols = buildColumnMap(sheet);
    const rows: TrackingRow[] = [];

    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const name = cellText(row, cols.name);
      if (!name) return;
      rows.push({
        rowNum,
        no:                 cellNumber(row, cols.no),
        project:            cellText(row, cols.project),
        name,
        email:              cellText(row, cols.email),
        serial:             cellText(row, cols.serial),
        account:            cellText(row, cols.account),   // '' if col absent (-1)
        deviceType:         cellText(row, cols.type),
        malwareAlerts:      cellText(row, cols.malwareAlerts),
        complianceChecks:   cellText(row, cols.complianceChecks),
        seedConfiguration:  cellText(row, cols.seedConfig),
        operatingSystem:    cellText(row, cols.os),
        followUpAction:     cellText(row, cols.followUp),
        responseFromTicket: cellText(row, cols.response),
        trackingStatus:     cellText(row, cols.status),
      });
    });

    return rows;
  } catch (err) {
    console.error('[tracking-reader] Failed to read tracking.xlsx:', (err as Error).message);
    return [];
  }
}

function norm(s: string): string { return s.toLowerCase().trim(); }

/**
 * Early account check (before AI call).
 * Matches submitted account string against tracking rows by account / email / name.
 */
export function accountInTracking(rows: TrackingRow[], account: string): boolean {
  return !!findRowForAccount(rows, account);
}

/**
 * Return the tracking row that owns this account (by account column, email, or name).
 * Returns undefined if no match.
 */
export function findRowForAccount(rows: TrackingRow[], account: string): TrackingRow | undefined {
  const acct = norm(account);
  if (!acct) return undefined;
  return rows.find(row =>
    (row.account && norm(row.account) === acct) ||
    (row.email   && norm(row.email)   === acct) ||
    (row.name    && norm(row.name)    === acct)
  );
}

/**
 * Full device match used after AI extracts deviceSerial / deviceName.
 */
export function matchesTrackingRow(
  row: TrackingRow,
  deviceSerial: string | null | undefined,
  deviceName: string | null | undefined,
  account: string,
): boolean {
  const serial = norm(deviceSerial ?? '');
  const dName  = norm(deviceName ?? '');
  const acct   = norm(account);

  // 1. Exact serial
  if (serial && norm(row.serial) === serial) return true;
  // 2. Exact AI device name vs tracking name
  if (dName && norm(row.name) === dName) return true;
  // 3. Account matches tracking account / name / email
  if (acct) {
    if (row.account && norm(row.account) === acct) return true;
    if (norm(row.name)  === acct) return true;
    if (norm(row.email) === acct) return true;
  }
  // 4. Partial serial in tracking serial or email
  if (serial) {
    if (norm(row.serial).includes(serial)) return true;
    if (norm(row.email).includes(serial))  return true;
  }
  return false;
}
