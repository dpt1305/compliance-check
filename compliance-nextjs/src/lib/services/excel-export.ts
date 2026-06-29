import ExcelJS from 'exceljs';
import type { UserListEntry } from './admin-user-list';

export function exportStatus(row: UserListEntry): string {
  if (row.trackingStatus?.trim()) return row.trackingStatus;
  if (row.submissionStatus === 'APPROVED') return 'OK';
  if (row.submissionStatus && row.submissionStatus !== 'NOT_SUBMITTED') return 'Rejected';
  return '';
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
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
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
      malwareAlerts: row.malwareAlerts ?? '',
      complianceChecks: row.complianceChecks ?? '',
      seedConfiguration: row.seedConfiguration ?? '',
      operatingSystem: row.operatingSystem ?? '',
      followUpAction: row.followUpAction ?? '',
      evdTicket: row.responseFromTicket ?? 'Refer photo captured in folder',
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
