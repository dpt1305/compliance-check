import { findAll } from '../storage/json-storage';
import ExcelJS from 'exceljs';

export async function generateReport(): Promise<Buffer> {
  const submissions = findAll();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Compliance Submissions');

  // Header row
  sheet.columns = [
    { header: 'ID',                key: 'id',              width: 8  },
    { header: 'Account',           key: 'account',         width: 20 },
    { header: 'Submission Type',   key: 'submissionType',  width: 18 },
    { header: 'Status',            key: 'status',          width: 12 },
    { header: 'Image URL',         key: 'imageUrl',        width: 40 },
    { header: 'Saved Filename',    key: 'imageSavedName',  width: 35 },
    { header: 'Submission Date',   key: 'submissionDate',  width: 24 },
    { header: 'Validation Result', key: 'validationResult',width: 50 },
  ];

  // Style header
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
  });

  // Data rows
  for (const s of submissions) {
    sheet.addRow({
      id: s.id,
      account: s.account,
      submissionType: s.submissionType,
      status: s.status,
      imageUrl: s.imageUrl ?? '',
      imageSavedName: s.imageSavedName ?? '',
      submissionDate: s.submissionDate ?? '',
      validationResult: s.validationResult ?? '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
