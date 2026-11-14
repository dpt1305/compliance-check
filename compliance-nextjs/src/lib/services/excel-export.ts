import ExcelJS from 'exceljs';
import type { UserListEntry } from './admin-user-list';

export function exportStatus(row: UserListEntry): string {
  // An admin approval always exports as OK, even if a stale tracking status says otherwise.
  if (row.submissionStatus?.toUpperCase() === 'APPROVED') return 'OK';
  if (row.trackingStatus?.trim()) return row.trackingStatus;
  if (row.submissionStatus && row.submissionStatus !== 'NOT_SUBMITTED') return 'Rejected';
  return '';
}

export function exportIssueCount(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const actionCount = trimmed.match(/^(\d+)\s*actions?$/i);
  if (actionCount && actionCount[1] === '0') return '';
  return actionCount ? actionCount[1] : trimmed;
}

export const DEFAULT_FOLLOW_UP_ACTION = 'No actions required';
export const DEFAULT_EVD_TICKET = 'Refer photo captured in folder';

// Always export the standard default, regardless of variants stored in tracking data
// (e.g. "No action require", "No action needed", "Default").
export function exportFollowUpAction(_value?: string | null): string {
  return DEFAULT_FOLLOW_UP_ACTION;
}

export function exportEvdTicket(_value?: string | null): string {
  return DEFAULT_EVD_TICKET;
}

export async function generateReport(entries: UserListEntry[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Compliance');

  sheet.columns = [
    { header: 'No.', key: 'no', width: 6 },
    { header: 'Project', key: 'project', width: 16 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Account', key: 'account', width: 20 },
    { header: 'Mail NCS', key: 'email', width: 28 },
    { header: 'Serial Number', key: 'serial', width: 20 },
    { header: 'Type', key: 'deviceType', width: 14 },
    { header: 'Malware Alerts', key: 'malwareAlerts', width: 16 },
    { header: 'Compliance Checks/Trellix', key: 'complianceChecks', width: 24 },
    { header: 'SEED Configuration', key: 'seedConfiguration', width: 20 },
    { header: 'Operating System', key: 'operatingSystem', width: 18 },
    { header: 'Follow up action', key: 'followUpAction', width: 20 },
    { header: 'EVD / Ticket', key: 'evdTicket', width: 32 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Note', key: 'note', width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006400' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  headerRow.height = 20;

  entries.forEach((row, index) => {
    const excelRow = sheet.addRow({
      no: index + 1,
      project: row.project ?? '',
      name: row.name ?? '',
      account: row.trackingAccount ?? row.account ?? '',
      email: row.email ?? '',
      serial: row.serial ?? row.deviceSerial ?? '',
      deviceType: row.deviceType ?? row.submissionType ?? '',
      malwareAlerts: exportIssueCount(row.malwareAlerts),
      complianceChecks: exportIssueCount(row.complianceChecks),
      seedConfiguration: exportIssueCount(row.seedConfiguration),
      operatingSystem: exportIssueCount(row.operatingSystem),
      followUpAction: exportFollowUpAction(row.followUpAction),
      evdTicket: exportEvdTicket(row.responseFromTicket),
      status: exportStatus(row),
      note: '',
    });

    excelRow.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
