import ExcelJS from 'exceljs';
import type { AiValidationResult } from './ai-validation';
import { existingTrackingPath } from '@/lib/utils/tracking-path';
import { buildColumnMap, cellText } from './tracking-reader';

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

/** Extract the first integer from any string. Returns '0' if none found. */
function toNumberOnly(s: string | null | undefined): string {
  if (s === null || s === undefined) return '0';
  const m = String(s).match(/\d+/);
  return m ? m[0] : '0';
}

function matchesDevice(
  extractedSerial: string | null | undefined,
  extractedName: string | null | undefined,
  submissionAccount: string,
  excelSerial: string,
  excelName: string,
  excelEmail: string,
  excelAccount: string,
): boolean {
  const serial = norm(extractedSerial);
  const name   = norm(extractedName);
  const acct   = norm(submissionAccount);

  // Serial match (exact then partial)
  if (serial && norm(excelSerial) === serial) return true;
  if (serial && norm(excelSerial).includes(serial)) return true;

  // Account match: submission account vs tracking account / email / name
  if (acct) {
    if (excelAccount && norm(excelAccount) === acct) return true;
    if (excelEmail   && norm(excelEmail)   === acct) return true;
    if (excelName    && norm(excelName)    === acct) return true;
  }

  // AI device name vs tracking name
  if (name && norm(excelName) === name) return true;

  // Serial found inside email column (some sheets embed serial in email)
  if (serial && norm(excelEmail).includes(serial)) return true;

  return false;
}

function extractNumber(text: string, keywords: string[]): string {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx < 0) continue;
    const after = text.slice(idx + kw.length);
    const numMatch = after.match(/\d+/);
    if (numMatch) return numMatch[0];
  }
  return '0';
}

export function buildSeedValues(result: AiValidationResult): [string, string, string, string] {
  if (result.seedDashboard) {
    return [
      toNumberOnly(result.seedDashboard.malwareAlerts),
      toNumberOnly(result.seedDashboard.complianceChecks),
      toNumberOnly(result.seedDashboard.seedConfiguration),
      toNumberOnly(result.seedDashboard.operatingSystem),
    ];
  }

  const reason = result.reason ?? '';
  if (reason.toLowerCase().includes('seed')) {
    return [
      extractNumber(reason, ['malware']),
      extractNumber(reason, ['compliance']),
      extractNumber(reason, ['seed', 'configuration']),
      extractNumber(reason, ['operating system', 'os']),
    ];
  }

  return ['0', '0', '0', '0'];
}

export async function updateTrackingExcel(
  submissionType: string,
  aiResult: AiValidationResult,
  account: string,
): Promise<void> {
  const filePath = existingTrackingPath();
  if (!filePath) {
    console.debug('[excel-update] EXCEL_UPDATE_PATH not configured or file not found, skipping');
    return;
  }

  const { deviceSerial, deviceName } = aiResult;
  if (!deviceSerial?.trim() && !deviceName?.trim() && !account.trim()) {
    console.warn('[excel-update] No device serial, name, or account to match on, skipping');
    return;
  }

  console.info(`[excel-update] Attempting update — serial="${deviceSerial}" name="${deviceName}" account="${account}" type="${submissionType}"`);

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    const cols = buildColumnMap(sheet);

    let updated = false;

    sheet.eachRow((row, rowNum) => {
      if (updated || rowNum === 1) return;

      const excelSerial  = cellText(row, cols.serial);
      const excelName    = cellText(row, cols.name);
      const excelEmail   = cellText(row, cols.email);
      const excelAccount = cellText(row, cols.account);

      if (!matchesDevice(deviceSerial, deviceName, account, excelSerial, excelName, excelEmail, excelAccount)) return;

      const [malwareAlerts, complianceChecks, seedConfig, operatingSystem] = buildSeedValues(aiResult);

      row.getCell(cols.malwareAlerts).value    = malwareAlerts;
      row.getCell(cols.complianceChecks).value = complianceChecks;
      row.getCell(cols.seedConfig).value       = seedConfig;
      row.getCell(cols.os).value               = operatingSystem;

      updated = true;
      console.info(
        `[excel-update] Updated row ${rowNum} — serial="${deviceSerial}" name="${deviceName}" account="${account}" ` +
        `values=[${malwareAlerts}, ${complianceChecks}, ${seedConfig}, ${operatingSystem}]`,
      );
    });

    if (updated) {
      await workbook.xlsx.writeFile(filePath);
      console.info('[excel-update] tracking.xlsx saved');
    } else {
      console.warn(`[excel-update] No matching row found for serial="${deviceSerial}" name="${deviceName}" account="${account}"`);
    }
  } catch (err) {
    console.error('[excel-update] Failed to update tracking.xlsx:', (err as Error).message);
  }
}
