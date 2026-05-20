import type { AiValidationResult } from './ai-validation';
import { readAll, updateSeedFields } from '@/lib/db/tracking-repo';
import type { TrackingMember } from '@/lib/db/tracking-repo';

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

/** Extract the first integer from any string or number. Returns '0' if none found. */
function toNumberOnly(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '0';
  const m = String(s).match(/\d+/);
  return m ? m[0] : '0';
}

function matchesDevice(
  extractedSerial: string | null | undefined,
  extractedName: string | null | undefined,
  submissionAccount: string,
  row: TrackingMember,
): boolean {
  const serial = norm(extractedSerial);
  const name   = norm(extractedName);
  const acct   = norm(submissionAccount);

  if (serial && norm(row.serial) === serial) return true;
  if (serial && norm(row.serial).includes(serial)) return true;

  if (acct) {
    if (row.account && norm(row.account) === acct) return true;
    if (row.email   && norm(row.email)   === acct) return true;
    if (row.name    && norm(row.name)    === acct) return true;
  }

  if (name && norm(row.name) === name) return true;
  if (serial && row.email && norm(row.email).includes(serial)) return true;

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
  void submissionType; // kept for API compatibility
  const { deviceSerial, deviceName } = aiResult;
  if (!deviceSerial?.trim() && !deviceName?.trim() && !account.trim()) {
    console.warn('[excel-update] No device serial, name, or account to match on, skipping');
    return;
  }

  console.info(`[excel-update] Attempting DB update — serial="${deviceSerial}" name="${deviceName}" account="${account}"`);

  try {
    const rows = await readAll();
    const match = rows.find(r => matchesDevice(deviceSerial, deviceName, account, r));

    if (!match) {
      console.warn(`[excel-update] No matching row found for serial="${deviceSerial}" name="${deviceName}" account="${account}"`);
      return;
    }

    const [malwareAlerts, complianceChecks, seedConfiguration, operatingSystem] = buildSeedValues(aiResult);
    await updateSeedFields(match.id, { malwareAlerts, complianceChecks, seedConfiguration, operatingSystem });

    console.info(`[excel-update] Updated DB row id=${match.id} — values=[${malwareAlerts}, ${complianceChecks}, ${seedConfiguration}, ${operatingSystem}]`);
  } catch (err) {
    console.error('[excel-update] Failed to update tracking DB:', (err as Error).message);
  }
}

