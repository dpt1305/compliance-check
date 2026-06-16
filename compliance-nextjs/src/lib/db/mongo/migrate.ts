/**
 * One-time migration: SQLite → MongoDB.
 *
 * Called automatically on first startup when MONGODB_URI is set and the MongoDB
 * collections are empty. If SQLite data already exists it is copied over; the
 * SQLite file is left untouched (read-only source of truth during the switch).
 *
 * The migration is idempotent — re-running it when collections are non-empty is a no-op.
 */
import path from 'path';
import { getMongoDb, getCounters } from './connection';
import type { Submission } from '@/lib/storage/json-storage';

function legacyPath(envVar: string, def: string): string {
  const p = process.env[envVar] ?? def;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

async function colEmpty(collectionName: string): Promise<boolean> {
  const db = await getMongoDb();
  const count = await db.collection(collectionName).countDocuments();
  return count === 0;
}

async function migrateFromSQLite(): Promise<void> {
  const sqlitePath = legacyPath('SQLITE_DB_PATH', './data/compliance.db');

  const { existsSync } = await import('fs');
  if (!existsSync(sqlitePath)) {
    console.log('[mongo-migrate] No SQLite DB found at', sqlitePath, '— skipping SQLite migration');
    return;
  }

  // Dynamically import better-sqlite3 (may not be installed in pure-Mongo deployments)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DatabaseCtor: (new (path: string, opts?: Record<string, unknown>) => any) | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DatabaseCtor = (require('better-sqlite3') as { default: typeof DatabaseCtor }).default ?? require('better-sqlite3');
  } catch {
    console.warn('[mongo-migrate] better-sqlite3 not available — skipping SQLite migration');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlite: any = new DatabaseCtor!(sqlitePath, { readonly: true });
  console.log('[mongo-migrate] Starting SQLite → MongoDB migration from', sqlitePath);

  const db = await getMongoDb();

  // ── tracking_members ──────────────────────────────────────────────────────
  if (await colEmpty('tracking_members')) {
    const rows = sqlite.prepare('SELECT * FROM tracking_members').all() as Record<string, unknown>[];
    if (rows.length > 0) {
      const docs = rows.map(r => ({
        id:                 r.id as number,
        no:                 r.no as number | null,
        project:            r.project as string | null,
        name:               r.name as string,
        email:              r.email as string | null,
        serial:             r.serial as string | null,
        account:            r.account as string | null,
        deviceType:         r.device_type as string | null,
        malwareAlerts:      r.malware_alerts as string | null,
        complianceChecks:   r.compliance_checks as string | null,
        seedConfiguration:  r.seed_configuration as string | null,
        operatingSystem:    r.operating_system as string | null,
        followUpAction:     r.follow_up_action as string | null,
        responseFromTicket: r.response_from_ticket as string | null,
        trackingStatus:     r.tracking_status as string | null,
        removedFromTracking: !!(r.removed_from_tracking as number),
        createdAt:          r.created_at as string | null,
        updatedAt:          r.updated_at as string | null,
      }));
      await db.collection('tracking_members').insertMany(docs);
      await (await getCounters()).updateOne(
        { _id: 'tracking_members' },
        { $set: { seq: Math.max(...docs.map(d => d.id)) } },
        { upsert: true },
      );
      console.log(`[mongo-migrate] tracking_members: migrated ${docs.length} rows`);
    }
  } else {
    console.log('[mongo-migrate] tracking_members: already populated, skipping');
  }

  // ── submissions ───────────────────────────────────────────────────────────
  if (await colEmpty('submissions')) {
    const rows = sqlite.prepare('SELECT * FROM submissions').all() as Record<string, unknown>[];
    if (rows.length > 0) {
      const docs = rows.map(r => ({
        numericId:            r.id as number,
        account:              r.account as string,
        submissionType:       r.submission_type as string,
        imagePath:            r.image_path as string | null,
        imageUrl:             r.image_url as string | null,
        imageOriginalName:    r.image_original_name as string | null,
        imageSavedName:       r.image_saved_name as string | null,
        status:               r.status as string,
        validationResult:     r.validation_result as string | null,
        validationChecklist:  r.validation_checklist as string | null,
        submissionDate:       r.submission_date as string,
        createdAt:            (() => { const d = new Date(r.submission_date as string); return Number.isNaN(d.getTime()) ? new Date() : d; })(),
        confidenceScore:      r.confidence_score as number | null,
        hasClock:             r.has_clock != null ? !!r.has_clock : null,
        hasWindowsUpdate:     r.has_windows_update != null ? !!r.has_windows_update : null,
        hasDeviceName:        r.has_device_name != null ? !!r.has_device_name : null,
        hasDeviceSerial:      r.has_device_serial != null ? !!r.has_device_serial : null,
        hasDashboard:         r.has_dashboard != null ? !!r.has_dashboard : null,
        hasSeedDashboard:     r.has_seed_dashboard != null ? !!r.has_seed_dashboard : null,
        hasTrellix:           r.has_trellix != null ? !!r.has_trellix : null,
        hasTimestamp:         r.has_timestamp != null ? !!r.has_timestamp : null,
        hasMacInfo:           r.has_mac_info != null ? !!r.has_mac_info : null,
        hasThinVirusThreatProtection:     r.has_thin_virus_threat_protection != null ? !!r.has_thin_virus_threat_protection : null,
        hasThinAccountProtection:         r.has_thin_account_protection != null ? !!r.has_thin_account_protection : null,
        hasThinFirewallNetworkProtection: r.has_thin_firewall_network_protection != null ? !!r.has_thin_firewall_network_protection : null,
        hasThinAppBrowserControl:         r.has_thin_app_browser_control != null ? !!r.has_thin_app_browser_control : null,
        hasThinDeviceSecurity:            r.has_thin_device_security != null ? !!r.has_thin_device_security : null,
        hasThinDevicePerformanceHealth:   r.has_thin_device_performance_health != null ? !!r.has_thin_device_performance_health : null,
        hasThinWindowsUpdate:             r.has_thin_windows_update != null ? !!r.has_thin_windows_update : null,
        hasThinSerialNumber:              r.has_thin_serial_number != null ? !!r.has_thin_serial_number : null,
        malwareAlerts:    r.malware_alerts as string | null,
        complianceCheck:  r.compliance_check as string | null,
        seedConfiguration:r.seed_configuration as string | null,
        operatingSystem:  r.operating_system as string | null,
        deviceSerial:     r.device_serial as string | null,
        deviceName:       r.device_name as string | null,
      }));
      await db.collection('submissions').insertMany(docs);
      await (await getCounters()).updateOne(
        { _id: 'submissions' },
        { $set: { seq: Math.max(...docs.map(d => d.numericId)) } },
        { upsert: true },
      );
      console.log(`[mongo-migrate] submissions: migrated ${docs.length} rows`);
    }
  } else {
    console.log('[mongo-migrate] submissions: already populated, skipping');
  }

  // ── attendance ────────────────────────────────────────────────────────────
  if (await colEmpty('attendance')) {
    const rows = sqlite.prepare('SELECT * FROM attendance').all() as Record<string, unknown>[];
    if (rows.length > 0) {
      const docs = rows.map(r => ({
        id:        r.id as number,
        date:      r.date as string,
        time:      r.time as string,
        session:   r.session as string,
        accountId: r.account_id as string,
        status:    r.status as string,
        remark:    r.remark as string | null,
        createdAt: r.created_at as string,
      }));
      await db.collection('attendance').insertMany(docs);
      await (await getCounters()).updateOne(
        { _id: 'attendance' },
        { $set: { seq: Math.max(...docs.map(d => d.id)) } },
        { upsert: true },
      );
      console.log(`[mongo-migrate] attendance: migrated ${docs.length} rows`);
    }
  } else {
    console.log('[mongo-migrate] attendance: already populated, skipping');
  }

  // ── admins ────────────────────────────────────────────────────────────────
  if (await colEmpty('admins')) {
    const rows = sqlite.prepare('SELECT * FROM admins').all() as Record<string, unknown>[];
    if (rows.length > 0) {
      const docs = rows.map(r => ({
        id:       r.id as string,
        username: r.username as string,
        password: r.password as string,
        email:    r.email as string | null ?? '',
        active:   !!(r.active as number),
      }));
      await db.collection('admins').insertMany(docs);
      console.log(`[mongo-migrate] admins: migrated ${docs.length} rows`);
    }
  } else {
    console.log('[mongo-migrate] admins: already populated, skipping');
  }

  sqlite.close();
  console.log('[mongo-migrate] SQLite → MongoDB migration complete');
}

async function migrateFromJsonFiles(): Promise<void> {
  const { existsSync, readFileSync } = await import('fs');

  // ── submissions.json ──────────────────────────────────────────────────────
  if (await colEmpty('submissions')) {
    const jsonPath = legacyPath('STORAGE_JSON_PATH', './data/submissions.json');
    if (existsSync(jsonPath)) {
      try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Submission[];
        if (data.length > 0) {
          const db = await getMongoDb();
          const docs = data.map(s => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, ...rest } = s;
            const parsedDate = new Date(s.submissionDate);
            return {
              ...rest,
              numericId: typeof id === 'number' ? id : 0,
              createdAt: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
            };
          });
          await db.collection('submissions').insertMany(docs);
          const maxId = Math.max(...docs.map(d => d.numericId));
          await (await getCounters()).updateOne(
            { _id: 'submissions' },
            { $set: { seq: maxId } },
            { upsert: true },
          );
          console.log(`[mongo-migrate] submissions.json: migrated ${docs.length} rows`);
        }
      } catch (err) {
        console.error('[mongo-migrate] submissions.json import failed:', (err as Error).message);
      }
    }
  }

  // ── admins.json ───────────────────────────────────────────────────────────
  if (await colEmpty('admins')) {
    const jsonPath = legacyPath('STORAGE_JSON_ADMIN_PATH', './data/admins.json');
    if (existsSync(jsonPath)) {
      try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Array<{
          id?: number | string; username: string; password: string; email?: string; active?: boolean;
        }>;
        const db = await getMongoDb();
        const docs = data.map(a => ({
          id:       String(a.id ?? crypto.randomUUID()),
          username: a.username,
          password: a.password,
          email:    a.email ?? '',
          active:   a.active !== false,
        }));
        await db.collection('admins').insertMany(docs);
        console.log(`[mongo-migrate] admins.json: migrated ${docs.length} rows`);
      } catch (err) {
        console.error('[mongo-migrate] admins.json import failed:', (err as Error).message);
      }
    }
  }
}

let migrated = false;

export async function runMongoMigrations(): Promise<void> {
  if (migrated) return;
  migrated = true;

  // Ensure indexes first
  const { ensureIndexes: ensureSubmission } = await import('./submission-repo');
  const { ensureIndexes: ensureAdmin }      = await import('./admin-repo');
  const { ensureIndexes: ensureTracking }   = await import('./tracking-repo');
  const { ensureIndexes: ensureAttendance } = await import('./attendance-repo');
  const { ensureIndexes: ensureConfig }     = await import('./config-repo');
  const { ensureIndexes: ensureMetadata }   = await import('./metadata-repo');
  await Promise.all([ensureSubmission(), ensureAdmin(), ensureTracking(), ensureAttendance(), ensureConfig(), ensureMetadata()]);

  // Try SQLite first (newest data source), then fall back to JSON files
  await migrateFromSQLite();

  // Fill any still-empty collections from JSON files
  await migrateFromJsonFiles();

  // Seed default admin if still no admins
  if (await colEmpty('admins')) {
    const { initDefaultAdmin } = await import('./admin-repo');
    await initDefaultAdmin();
    console.log('[mongo-migrate] Seeded default admin (admin / Admin@123)');
  }

  // Init tracking version counter if missing
  await (await getCounters()).updateOne(
    { _id: 'tracking_version' },
    { $setOnInsert: { seq: 0 } },
    { upsert: true },
  );

  // Seed default project config if missing
  await seedDefaultConfig();

  // Backfill createdAt for any submission documents that pre-date the TTL field
  await backfillSubmissionCreatedAt();

  // Apply S3 lifecycle rule for image expiry (no-op if S3 is not configured)
  const { ensureS3LifecycleRule } = await import('@/lib/utils/file-storage');
  await ensureS3LifecycleRule();
}

/**
 * Seed the default project config on first run if no config exists.
 */
async function seedDefaultConfig(): Promise<void> {
  if (await colEmpty('project_config')) {
    try {
      const { seedConfig } = await import('./config-repo');
      const { getDefaultConfig } = await import('@/lib/services/project-config');
      const config = getDefaultConfig();
      await seedConfig(config, 'Seeded from existing compliance config');
      console.log('[mongo-migrate] Seeded default project config (v1)');
    } catch (err) {
      console.error('[mongo-migrate] Config seed failed:', (err as Error).message);
    }
  } else {
    console.log('[mongo-migrate] project_config: already populated, skipping');
  }
}

/**
 * One-time backfill: set createdAt on any existing submission documents that
 * were inserted before the TTL field was introduced.
 */
async function backfillSubmissionCreatedAt(): Promise<void> {
  try {
    const db = await getMongoDb();
    const col = db.collection('submissions');
    const result = await col.updateMany(
      { createdAt: { $exists: false } },
      [
        {
          $set: {
            createdAt: {
              $cond: {
                if: { $and: [{ $ne: ['$submissionDate', null] }, { $ne: ['$submissionDate', ''] }] },
                then: { $dateFromString: { dateString: '$submissionDate', onError: '$$NOW', onNull: '$$NOW' } },
                else: '$$NOW',
              },
            },
          },
        },
      ],
    );
    if (result.modifiedCount > 0) {
      console.log(`[mongo-migrate] backfilled createdAt on ${result.modifiedCount} submission(s)`);
    }
  } catch (err) {
    console.error('[mongo-migrate] createdAt backfill failed:', (err as Error).message);
  }
}
