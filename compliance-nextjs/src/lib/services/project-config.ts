/**
 * Project config service — caching, version operations, defaults.
 *
 * Provides a high-level API for managing config versions:
 * - Read published config (cached)
 * - Create/update draft
 * - Publish draft
 * - Revert to version
 * - List versions
 */
import { isMongoEnabled } from '../db/mongo/connection';
import type { ProjectConfig, ConfigVersionSummary, FormField, SubmissionType, PreValidationRule } from '../db/mongo/config-repo';

// ── Types (re-exported for convenience) ──────────────────────────────────────
export type { ProjectConfig, ConfigVersionSummary, FormField, SubmissionType, PreValidationRule };

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache: { config: ProjectConfig; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cache.timestamp < CACHE_TTL_MS;
}

export function clearConfigCache(): void {
  cache = null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Get the currently published config (cached). */
export async function getActiveConfig(): Promise<ProjectConfig | null> {
  if (isCacheValid()) return cache!.config;
  if (!isMongoEnabled()) return getDefaultConfig();

  const { findPublished } = await import('../db/mongo/config-repo');
  const config = await findPublished();
  if (config) {
    cache = { config, timestamp: Date.now() };
  }
  return config;
}

/** Get the current draft config (if any). */
export async function getDraftConfig(): Promise<ProjectConfig | null> {
  if (!isMongoEnabled()) return null;
  const { findDraft } = await import('../db/mongo/config-repo');
  return await findDraft();
}

/** Get all config versions (summary). */
export async function getAllVersions(): Promise<ConfigVersionSummary[]> {
  if (!isMongoEnabled()) return [];
  const { findAllVersions } = await import('../db/mongo/config-repo');
  return await findAllVersions();
}

/** Get a specific version's config. */
export async function getVersion(version: number): Promise<ProjectConfig | null> {
  if (!isMongoEnabled()) return null;
  const { findByVersion } = await import('../db/mongo/config-repo');
  return await findByVersion(version);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Create a draft from the current published config.
 * Returns the new draft version number.
 */
export async function createDraft(createdBy: string): Promise<number> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB');
  const { createDraftFromPublished } = await import('../db/mongo/config-repo');
  const doc = await createDraftFromPublished(createdBy);
  clearConfigCache();
  return doc.version;
}

/**
 * Update the current draft config.
 */
export async function updateDraft(config: ProjectConfig, createdBy: string): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB');
  const { updateDraft } = await import('../db/mongo/config-repo');
  await updateDraft(config, createdBy);
  clearConfigCache();
}

/**
 * Publish the current draft. Archives old published, promotes draft.
 */
export async function publishDraft(note: string | undefined, createdBy: string): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB');
  const { publishDraft } = await import('../db/mongo/config-repo');
  await publishDraft(note, createdBy);
  clearConfigCache();
}

/**
 * Revert to a specific version. Creates a new published version from that config.
 */
export async function revertToVersion(version: number, note: string | undefined, createdBy: string): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB');
  const { revertToVersion } = await import('../db/mongo/config-repo');
  await revertToVersion(version, note, createdBy);
  clearConfigCache();
}

/**
 * Delete an archived version.
 */
export async function deleteVersion(version: number): Promise<boolean> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB');
  const { deleteVersion } = await import('../db/mongo/config-repo');
  const result = await deleteVersion(version);
  if (result) clearConfigCache();
  return result;
}

/**
 * Clone a specific version into a new draft.
 */
export async function cloneVersionToDraft(version: number, createdBy: string): Promise<number> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB');
  const { cloneVersionToDraft } = await import('../db/mongo/config-repo');
  const doc = await cloneVersionToDraft(version, createdBy);
  clearConfigCache();
  return doc.version;
}

// ── Default Config (seed) ─────────────────────────────────────────────────────

/**
 * Returns the default config matching the current hardcoded compliance system.
 * Used for seeding on first run and as fallback when MongoDB has no config.
 */
export function getDefaultConfig(): ProjectConfig {
  return {
    name: 'Device Compliance',
    description: 'Submit your device compliance screenshot for AI validation',
    formFields: [
      { key: 'account', label: 'Account ID', type: 'text', required: true, placeholder: 'e.g. HuyenTP' },
      {
        key: 'submissionType',
        label: 'Submission Type',
        type: 'dropdown',
        required: true,
        options: [
          { label: 'Windows', value: 'windows' },
          { label: 'Mac', value: 'mac' },
          { label: 'Thin Client', value: 'thin' },
        ],
      },
      {
        key: 'image',
        label: 'Image',
        type: 'file',
        required: true,
        accept: '.jpg,.jpeg,.png,.webp',
        maxFileSizeMb: 10,
      },
    ],
    submissionTypes: [
      {
        key: 'windows',
        label: 'Windows',
        description: 'Windows laptop or desktop',
        sampleImageUrl: '/window_sample.png',
        aiPrompt: getDefaultWindowsPrompt(),
        aiExtractFields: [
          { key: 'deviceSerial', label: 'Device Serial', instruction: 'Extract the device serial number visible anywhere in the screenshot', type: 'text' },
          { key: 'deviceName', label: 'Device Name', instruction: 'Extract the device name visible anywhere in the screenshot', type: 'text' },
        ],
        minConfidence: 100,
        checklistItems: [
          { key: 'hasClock', label: 'System Clock', description: 'A date or time is visible anywhere on screen' },
          { key: 'hasWindowsUpdate', label: 'Windows Update', description: 'Windows Update screen showing "You\'re up to date"' },
          { key: 'hasDeviceName', label: 'Device Name', description: 'Device name is clearly visible' },
          { key: 'hasDeviceSerial', label: 'Device Serial', description: 'Device serial number is clearly visible' },
          { key: 'hasDashboard', label: 'SEED Dashboard', description: 'SEED dashboard is clearly visible with 4 metric counters' },
        ],
      },
      {
        key: 'mac',
        label: 'Mac',
        description: 'Apple Mac device',
        sampleImageUrl: '/macos_sample.png',
        aiPrompt: getDefaultMacPrompt(),
        aiExtractFields: [
          { key: 'deviceSerial', label: 'Device Serial', instruction: 'Extract the device serial number from the image', type: 'text' },
          { key: 'deviceName', label: 'Device Name', instruction: 'Extract the device name from the image', type: 'text' },
        ],
        minConfidence: 100,
        checklistItems: [
          { key: 'hasSeedDashboard', label: 'SEED Dashboard', description: 'SEED dashboard is clearly visible' },
          { key: 'hasTimestamp', label: 'Timestamp', description: 'A readable date or time is visible' },
          { key: 'hasMacInfo', label: 'Mac System Info', description: 'macOS system info showing model name and serial' },
        ],
      },
      {
        key: 'thin',
        label: 'Thin Client',
        description: 'Thin client device',
        sampleImageUrl: '/thin_sample_2.png',
        aiPrompt: getDefaultThinPrompt(),
        aiExtractFields: [
          { key: 'deviceSerial', label: 'Device Serial', instruction: 'Extract the serial number from the terminal output', type: 'text' },
        ],
        minConfidence: 100,
        checklistItems: [
          { key: 'hasFullScan', label: 'Full Scan', description: 'Windows Security scan options showing completed full scan' },
          { key: 'hasWindowsUpdate', label: 'Windows Update', description: 'Windows Update page showing "You\'re up to date"' },
          { key: 'hasSerialNumber', label: 'Serial Number', description: 'Terminal showing serial number output' },
        ],
      },
    ],
    outputColumns: [
      { key: 'no', label: 'No.', source: 'computed', format: 'number', width: 40, sortable: true, excelVisible: true },
      { key: 'project', label: 'Project', source: 'tracking_field', fieldKey: 'project', format: 'text', width: 60, sortable: true, editable: true, excelVisible: true },
      { key: 'name', label: 'Name', source: 'tracking_field', fieldKey: 'name', format: 'text', width: 60, sortable: true, editable: true, excelVisible: true },
      { key: 'account', label: 'Account', source: 'tracking_field', fieldKey: 'account', format: 'text', width: 60, sortable: true, editable: true, excelVisible: true },
      { key: 'email', label: 'Email', source: 'tracking_field', fieldKey: 'email', format: 'text', width: 60, sortable: true, editable: true, excelVisible: true },
      { key: 'serial', label: 'Serial', source: 'tracking_field', fieldKey: 'serial', format: 'text', width: 60, sortable: true, editable: true, excelVisible: true },
      { key: 'type', label: 'Type', source: 'tracking_field', fieldKey: 'deviceType', format: 'text', width: 50, sortable: true, editable: true, excelVisible: true },
      { key: 'status', label: 'Status', source: 'computed', format: 'badge', width: 80, sortable: true, editable: true, excelVisible: true },
      { key: 'malwareAlerts', label: 'Malware Alerts', source: 'tracking_field', fieldKey: 'malwareAlerts', format: 'text', width: 80, sortable: true, editable: true, excelVisible: true },
      { key: 'complianceChecks', label: 'Compliance Checks', source: 'tracking_field', fieldKey: 'complianceChecks', format: 'text', width: 80, sortable: true, editable: true, excelVisible: true },
      { key: 'seedConfig', label: 'SEED Config', source: 'tracking_field', fieldKey: 'seedConfiguration', format: 'text', width: 80, sortable: true, editable: true, excelVisible: true },
      { key: 'os', label: 'OS', source: 'tracking_field', fieldKey: 'operatingSystem', format: 'text', width: 50, sortable: true, editable: true, excelVisible: true },
      { key: 'submitted', label: 'Submitted', source: 'computed', format: 'datetime', width: 100, sortable: true, excelVisible: true },
      { key: 'image', label: 'Image', source: 'computed', format: 'image', width: 56, excelVisible: false },
      { key: 'actions', label: 'Actions', source: 'computed', format: 'text', width: 72, excelVisible: false },
    ],
  };
}

// ── Default AI Prompts (extracted from current ai-validation.ts) ──────────────

function getDefaultWindowsPrompt(): string {
  return `You are a compliance image validator for Windows device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true and confidence=100.

1. SEED DASHBOARD — The SEED dashboard is clearly visible showing the device name, device serial number, and all 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable).

2. CLOCK — A date or time is visible anywhere on screen.
   Detection rule: Look at the ENTIRE image for any readable time (e.g. "4:08 PM", "08:52 AM", "16:08") or any readable date (e.g. "5/15/2026", "12 Dec 2025", "15/05/2026"). This includes: Windows taskbar bottom-right, page footers, browser tab timestamps, Settings headers, or any other UI element. If you can read ANY time or date text anywhere in the image — even in small text — set hasClock=true. Only set hasClock=false if there is truly zero readable date or time anywhere in the entire image.

3. UPDATE — Windows Update screen is visible showing "You're up to date" or an equivalent completion message.

4. DEVICE NAME — Device name is clearly visible anywhere in the screenshot (SEED Dashboard device info, Settings, title bar, system info, etc.).

5. DEVICE SERIAL — Device serial number is clearly visible anywhere in the screenshot (SEED Dashboard, system info, Settings, etc.).

ALL five checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: device serial number and device name visible anywhere in the screenshot.
SEED DASHBOARD COUNTERS: If hasDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) — no units or labels.
- malwareAlerts: integer shown in the "Malware Alerts" tile
- complianceChecks: integer shown in the "Compliance Checks" tile
- seedConfiguration: integer shown in the "SEED Configuration" tile
- operatingSystem: integer shown in the "Operating System" tile
If hasDashboard=false, set seedDashboard fields to null.

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceSerial":"...","deviceName":"...","seedDashboard":{"malwareAlerts":0,"complianceChecks":0,"seedConfiguration":0,"operatingSystem":0},"checklist":{"hasDashboard":true,"hasClock":true,"hasWindowsUpdate":true,"hasDeviceName":true,"hasDeviceSerial":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;
}

function getDefaultMacPrompt(): string {
  return `You are a compliance image validator for macOS device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true.

IMPORTANT RULES — follow these strictly:
- You MUST ONLY check the items listed below. Do NOT invent additional checks.
- Do NOT validate or question the macOS version number (e.g. macOS 26, Tahoe, Sequoia — any version is acceptable).
- Do NOT check for Trellix — it is not required.

1. SEED DASHBOARD — The SEED dashboard is clearly visible showing the device name, device serial number, and all 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable).

2. TIMESTAMP — A readable date or time is visible ANYWHERE in the image. Look at the entire image: menu bar clock, browser tab, page footer, system clock, any UI element. If ANY readable time or date text is found anywhere — set hasTimestamp=true. Only set hasTimestamp=false if there is truly zero readable date or time in the entire image.

3. MAC SYSTEM INFO — macOS system info is visible (System Preferences / System Settings → About This Mac or equivalent) showing at least the model name and serial number.

ALL three checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: deviceName and deviceSerial from anywhere visible in the image.

SEED DASHBOARD COUNTERS: If hasSeedDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) — no units or labels.
- malwareAlerts: integer shown in the "Malware Alerts" tile
- complianceChecks: integer shown in the "Compliance Checks" tile
- seedConfiguration: integer shown in the "SEED Configuration" tile
- operatingSystem: integer shown in the "Operating System" tile
If hasSeedDashboard=false, set seedDashboard to null.

For each checklist item set to false, add a clear description to "failedChecks" explaining exactly what is missing.

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceName":"...","deviceSerial":"...","seedDashboard":{"malwareAlerts":0,"complianceChecks":0,"seedConfiguration":0,"operatingSystem":0},"checklist":{"hasSeedDashboard":true,"hasTimestamp":true,"hasMacInfo":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;
}

function getDefaultThinPrompt(): string {
  return `You are a compliance image validator for thin client (Windows) device verification.

The submitted screenshot(s) MUST satisfy ALL of the following checks:

WINDOWS SECURITY — SCAN OPTIONS SCREEN (NOT the home/overview screen):
1. FULL_SCAN — The Windows Security > Virus & threat protection > Scan options page MUST be physically visible in the screenshot showing ALL of:
   - A completed "Full scan" result (the text "full scan" must appear in the last scan line, e.g. "Last scan: ... (full scan)")
   - "No current threats" text
   - "0 threats found" text
   - A scan date/time (last scan timestamp)
   - Number of files scanned (any number followed by "files scanned")
   STRICT RULE: If this page is not visible, or the completed scan result text is absent, set hasFullScan=false. The "Full scan" radio button being selected alone is NOT sufficient.

WINDOWS UPDATE SCREEN:
2. WINDOWS_UPDATE — The Windows Settings > Windows Update page MUST be physically visible in the screenshot.
   WHAT TO LOOK FOR: The page heading text "Windows Update" AND the status text "You're up to date" or "Up to date" with a green checkmark icon must both appear in the screenshot.
   HARD BLOCK — set hasWindowsUpdate=false if ANY of the following are true:
   - The page shown is Windows Security (antivirus/threat protection/scan options) — this is NOT Windows Update
   - The only update-related evidence is a completed scan or "No current threats" text — this is NOT Windows Update
   - The Windows Update heading and "You're up to date" text are not both physically visible
   - You cannot find the exact text "Windows Update" as a page title or heading in the screenshot
   Do NOT infer, assume, or derive update status from any other screen. A full scan result does NOT imply Windows is up to date.

TERMINAL / COMMAND LINE:
3. SERIAL_NUMBER — A terminal window (PowerShell, CMD, or similar) MUST be physically visible showing a serial number value as output.
   STRICT RULE: If no terminal window is visible, set hasSerialNumber=false. Partial wrapping of the serial number value is acceptable — do not fail this check due to text wrapping alone.

ALL 3 checks must pass for valid=true. If ANY ONE fails, set valid=false immediately.
- Each check must be PHYSICALLY VISIBLE in the screenshot — do not infer, assume, or guess.
- Do NOT set valid=true unless hasFullScan=true AND hasWindowsUpdate=true AND hasSerialNumber=true.
- COMMON MISTAKE TO AVOID: Windows Security ≠ Windows Update. Seeing a scan result does NOT mean Windows Update is satisfied.
- List every failed check in failedChecks with a specific reason.

ALSO EXTRACT: the device serial number text visible in the terminal output (partial value is acceptable).

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceSerial":"extracted-serial-or-null","checklist":{"hasFullScan":true,"hasWindowsUpdate":true,"hasSerialNumber":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;
}
