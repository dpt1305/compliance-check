import { readAll } from '../db/tracking-repo';
import ExcelJS from 'exceljs';

export async function generateReport(): Promise<Buffer> {
  const members = await readAll();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Compliance');

  sheet.columns = [
    { header: 'No.',                        key: 'no',                width: 6  },
    { header: 'Project',                    key: 'project',           width: 16 },
    { header: 'Name',                       key: 'name',              width: 24 },
    { header: 'Account',                    key: 'account',           width: 20 },
    { header: 'Mail NCS',                   key: 'email',             width: 28 },
    { header: 'Serial Number',              key: 'serial',            width: 20 },
    { header: 'Type',                       key: 'deviceType',        width: 14 },
    { header: 'Malware Alerts',             key: 'malwareAlerts',     width: 16 },
    { header: 'Compliance Checks/Trellix',  key: 'complianceChecks',  width: 24 },
    { header: 'SEED Configuration',         key: 'seedConfiguration', width: 20 },
    { header: 'Operating System',           key: 'operatingSystem',   width: 18 },
    { header: 'Follow up action',           key: 'followUpAction',    width: 20 },
    { header: 'EVD / Ticket',               key: 'evdTicket',         width: 32 },
    { header: 'Status',                     key: 'status',            width: 16 },
    { header: 'Note',                       key: 'note',              width: 20 },
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  headerRow.height = 20;

  // Data rows — skip removed members
  const active = members.filter(m => !m.removedFromTracking);
  active.forEach((m, index) => {
    const row = sheet.addRow({
      no:                m.no ?? (index + 1),
      project:           m.project ?? '',
      name:              m.name,
      account:           m.account ?? '',
      email:             m.email ?? '',
      serial:            m.serial ?? '',
      deviceType:        m.deviceType ?? '',
      malwareAlerts:     m.malwareAlerts ?? '',
      complianceChecks:  m.complianceChecks ?? '',
      seedConfiguration: m.seedConfiguration ?? '',
      operatingSystem:   m.operatingSystem ?? '',
      followUpAction:    m.followUpAction ?? '',
      evdTicket:         m.responseFromTicket ?? 'Refer photo captured in folder',
      status:            m.trackingStatus ?? '',
      note:              '',
    });
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
