/**
 * Auto-migration: on first startup, if DB tables are empty and legacy files
 * exist, seed the DB from them. Runs once; safe to call on every startup.
 */
import fs from 'fs';
import path from 'path';
import { db } from './index';
import { trackingMembers, submissions, admins } from './schema';
import { replaceAll as replaceTracking } from './tracking-repo';
import { initDefaultAdmin } from './admin-repo';
import type { Submission } from '@/lib/storage/json-storage';

function legacyPath(envVar: string, def: string): string {
  const p = process.env[envVar] ?? def;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function countRows(table: { getSQL: () => unknown }): number {
  try {
    const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
    const name = (table as unknown as { _: { name: string } })._.name;
    const row = raw.prepare(`SELECT COUNT(*) as c FROM ${name}`).get() as { c: number };
    return row.c;
  } catch { return 0; }
}

async function migrateTracking() {
  if (countRows(trackingMembers) > 0) return;

  const xlsxPath = legacyPath('EXCEL_UPDATE_PATH', './data/tracking.xlsx');
  if (!fs.existsSync(xlsxPath)) return;

  try {
    // Lazy import — ExcelJS is large and only needed for migration
    const ExcelJS = (await import('exceljs')).default;
    const { readTrackingRows } = await import('@/lib/services/tracking-reader');

    void ExcelJS; // ensure import is used (readTrackingRows uses it internally)
    const rows = await readTrackingRows();
    if (rows.length === 0) return;

    replaceTracking(rows.map(r => ({
      no:                 r.no ?? undefined,
      project:            r.project || undefined,
      name:               r.name,
      email:              r.email || undefined,
      serial:             r.serial || undefined,
      account:            r.account || undefined,
      deviceType:         r.deviceType || undefined,
      malwareAlerts:      r.malwareAlerts || undefined,
      complianceChecks:   r.complianceChecks || undefined,
      seedConfiguration:  r.seedConfiguration || undefined,
      operatingSystem:    r.operatingSystem || undefined,
      followUpAction:     r.followUpAction || undefined,
      responseFromTicket: r.responseFromTicket || undefined,
      trackingStatus:     r.trackingStatus || undefined,
    })));

    console.log(`[migrate] Imported ${rows.length} tracking rows from tracking.xlsx`);
  } catch (err) {
    console.error('[migrate] tracking.xlsx import failed:', (err as Error).message);
  }
}

async function migrateSubmissions() {
  if (countRows(submissions) > 0) return;

  const jsonPath = legacyPath('STORAGE_JSON_PATH', './data/submissions.json');
  if (!fs.existsSync(jsonPath)) return;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Submission[];
    if (data.length === 0) return;

    const raw = (db as unknown as { $client: import('better-sqlite3').Database }).$client;
    const stmt = raw.prepare(`
      INSERT OR IGNORE INTO submissions (
        id, account, submission_type, image_path, image_url,
        image_original_name, image_saved_name, status, validation_result,
        validation_checklist, submission_date, confidence_score,
        has_clock, has_windows_update, has_device_name, has_device_serial, has_dashboard,
        has_seed_dashboard, has_trellix, has_timestamp, has_mac_info,
        has_thin_virus_threat_protection, has_thin_account_protection,
        has_thin_firewall_network_protection, has_thin_app_browser_control,
        has_thin_device_security, has_thin_device_performance_health,
        has_thin_windows_update, has_thin_serial_number,
        malware_alerts, compliance_check, seed_configuration, operating_system,
        device_serial, device_name
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const insertAll = raw.transaction((rows: Submission[]) => {
      for (const s of rows) {
        stmt.run(
          s.id, s.account, s.submissionType, s.imagePath, s.imageUrl,
          s.imageOriginalName, s.imageSavedName, s.status, s.validationResult,
          s.validationChecklist ?? null, s.submissionDate, s.confidenceScore ?? null,
          s.hasClock ?? null, s.hasWindowsUpdate ?? null, s.hasDeviceName ?? null,
          s.hasDeviceSerial ?? null, s.hasDashboard ?? null,
          s.hasSeedDashboard ?? null, s.hasTrellix ?? null, s.hasTimestamp ?? null,
          s.hasMacInfo ?? null,
          s.hasThinVirusThreatProtection ?? null, s.hasThinAccountProtection ?? null,
          s.hasThinFirewallNetworkProtection ?? null, s.hasThinAppBrowserControl ?? null,
          s.hasThinDeviceSecurity ?? null, s.hasThinDevicePerformanceHealth ?? null,
          s.hasThinWindowsUpdate ?? null, s.hasThinSerialNumber ?? null,
          s.malwareAlerts ?? null, s.complianceCheck ?? null, s.seedConfiguration ?? null,
          s.operatingSystem ?? null, s.deviceSerial ?? null, s.deviceName ?? null,
        );
      }
    });
    insertAll(data);

    console.log(`[migrate] Imported ${data.length} submissions from submissions.json`);
  } catch (err) {
    console.error('[migrate] submissions.json import failed:', (err as Error).message);
  }
}

async function migrateAdmins() {
  if (countRows(admins) > 0) return;

  const jsonPath = legacyPath('STORAGE_JSON_ADMIN_PATH', './data/admins.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Array<{
        id?: number | string; username: string; password: string; email?: string; active?: boolean;
      }>;
      for (const a of data) {
        db.insert(admins).values({
          id:       String(a.id ?? crypto.randomUUID()),
          username: a.username,
          password: a.password,
          email:    a.email ?? null,
          active:   a.active !== false,
        }).onConflictDoNothing().run();
      }
      console.log(`[migrate] Imported ${data.length} admin(s) from admins.json`);
      return;
    } catch (err) {
      console.error('[migrate] admins.json import failed:', (err as Error).message);
    }
  }

  // No legacy file — seed default admin
  initDefaultAdmin();
  console.log('[migrate] Seeded default admin (admin / Admin@123)');
}

let migrated = false;

export async function runMigrations(): Promise<void> {
  if (migrated) return;
  migrated = true;
  await Promise.all([migrateTracking(), migrateSubmissions(), migrateAdmins()]);
}
