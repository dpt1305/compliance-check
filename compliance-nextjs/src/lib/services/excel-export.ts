import { findAll } from '../db/submission-repo';
import { readAll, matchesTrackingRow, type TrackingMember } from '../db/tracking-repo';
import ExcelJS from 'exceljs';
import { getActiveConfig } from '../services/project-config';

function compareValues(a: string | number, b: string | number, sortDir: 'asc' | 'desc') {
  let cmp = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  }
  return sortDir === 'asc' ? cmp : -cmp;
}

function bestSubmissionFor(member: TrackingMember, submissions: Awaited<ReturnType<typeof findAll>>) {
  const matches = submissions.filter(s => matchesTrackingRow(member, s.deviceSerial, s.deviceName, s.account));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())[0];
}

/**
 * Resolve a cell value from a column definition against member + submission data.
 */
function resolveCellValue(
  col: { key: string; source: string; fieldKey?: string },
  member: TrackingMember,
  submission: NonNullable<ReturnType<typeof bestSubmissionFor>>,
  index: number,
): string | number {
  switch (col.source) {
    case 'computed':
      if (col.key === 'no') return member.no ?? (index + 1);
      if (col.key === 'submitted') return submission.submissionDate ? new Date(submission.submissionDate).toLocaleString() : '';
      if (col.key === 'image') return submission.imageSavedName ?? '';
      if (col.key === 'actions') return '';
      if (col.key === 'status') return submission.status ?? '';
      return '';

    case 'tracking_field': {
      const fk = col.fieldKey;
      if (!fk) return '';
      if (fk === 'project') return member.project ?? '';
      if (fk === 'name') return member.name;
      if (fk === 'account') return member.account ?? '';
      if (fk === 'email') return member.email ?? '';
      if (fk === 'serial') return member.serial ?? '';
      if (fk === 'deviceType') return member.deviceType ?? '';
      if (fk === 'malwareAlerts') return member.malwareAlerts ?? '';
      if (fk === 'complianceChecks') return member.complianceChecks ?? '';
      if (fk === 'seedConfiguration') return member.seedConfiguration ?? '';
      if (fk === 'operatingSystem') return member.operatingSystem ?? '';
      return '';
    }

    case 'form_field':
      if (col.fieldKey === 'submissionType') return submission.submissionType;
      if (col.fieldKey === 'account') return submission.account;
      return '';

    case 'ai_extract':
      if (col.fieldKey === 'deviceSerial') return submission.deviceSerial ?? '';
      if (col.fieldKey === 'deviceName') return submission.deviceName ?? '';
      return '';

    default:
      return '';
  }
}

export async function generateReport(sortCol = 'name', sortDir: 'asc' | 'desc' = 'asc'): Promise<Buffer> {
  const [members, submissions] = await Promise.all([readAll(), findAll()]);
  const config = await getActiveConfig();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Compliance');

  // Use dynamic columns from config if available, otherwise fallback to hardcoded
  const useDynamicColumns = config?.outputColumns && config.outputColumns.length > 0;

  if (useDynamicColumns) {
    const excelCols = config.outputColumns.filter(c => c.excelVisible !== false);

    sheet.columns = excelCols.map(col => ({
      header: col.label,
      key: col.key,
      width: col.width || 16,
    }));

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

    // Data rows
    const active = members.filter(m => !m.removedFromTracking);
    const sortable = active.map(member => ({ member, submission: bestSubmissionFor(member, submissions) }));

    sortable.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      const colDef = config!.outputColumns.find(c => c.key === sortCol);
      if (colDef) {
        va = resolveCellValue(colDef, a.member, a.submission!, 0);
        vb = resolveCellValue(colDef, b.member, b.submission!, 0);
      } else {
        va = a.member.name ?? '';
        vb = b.member.name ?? '';
      }
      return compareValues(va, vb, sortDir);
    });

    sortable.forEach(({ member: m }, index) => {
      const rowData: Record<string, string | number> = {};
      for (const col of excelCols) {
        const sub = bestSubmissionFor(m, submissions);
        rowData[col.key] = sub ? resolveCellValue(col, m, sub, index) : '';
      }
      const row = sheet.addRow(rowData);
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
      });
    });
  } else {
    // Fallback: hardcoded columns (original behavior)
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
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    headerRow.height = 20;

    const active = members.filter(m => !m.removedFromTracking);
    const sortable = active.map(member => ({ member, submission: bestSubmissionFor(member, submissions) }));

    sortable.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortCol) {
        case 'project':
          va = a.member.project ?? '';
          vb = b.member.project ?? '';
          break;
        case 'name':
          va = a.member.name ?? '';
          vb = b.member.name ?? '';
          break;
        case 'account':
          va = a.member.account ?? '';
          vb = b.member.account ?? '';
          break;
        case 'email':
          va = a.member.email ?? '';
          vb = b.member.email ?? '';
          break;
        case 'serial':
          va = a.member.serial ?? '';
          vb = b.member.serial ?? '';
          break;
        case 'type':
          va = a.member.deviceType ?? a.submission?.submissionType ?? '';
          vb = b.member.deviceType ?? b.submission?.submissionType ?? '';
          break;
        case 'status':
          va = a.submission?.status ?? 'NOT_SUBMITTED';
          vb = b.submission?.status ?? 'NOT_SUBMITTED';
          break;
        case 'malwareAlerts':
          va = a.member.malwareAlerts ?? '';
          vb = b.member.malwareAlerts ?? '';
          break;
        case 'complianceChecks':
          va = a.member.complianceChecks ?? '';
          vb = b.member.complianceChecks ?? '';
          break;
        case 'seedConfig':
          va = a.member.seedConfiguration ?? '';
          vb = b.member.seedConfiguration ?? '';
          break;
        case 'os':
          va = a.member.operatingSystem ?? '';
          vb = b.member.operatingSystem ?? '';
          break;
        case 'submitted':
          va = new Date(a.submission?.submissionDate ?? 0).getTime();
          vb = new Date(b.submission?.submissionDate ?? 0).getTime();
          break;
        default:
          va = a.member.name ?? '';
          vb = b.member.name ?? '';
          break;
      }
      return compareValues(va, vb, sortDir);
    });

    sortable.forEach(({ member: m }, index) => {
      const row = sheet.addRow({
        no: m.no ?? (index + 1),
        project: m.project ?? '',
        name: m.name,
        account: m.account ?? '',
        email: m.email ?? '',
        serial: m.serial ?? '',
        deviceType: m.deviceType ?? '',
        malwareAlerts: m.malwareAlerts ?? '',
        complianceChecks: m.complianceChecks ?? '',
        seedConfiguration: m.seedConfiguration ?? '',
        operatingSystem: m.operatingSystem ?? '',
        followUpAction: m.followUpAction ?? '',
        evdTicket: m.responseFromTicket ?? 'Refer photo captured in folder',
        status: m.trackingStatus ?? '',
        note: '',
      });
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
