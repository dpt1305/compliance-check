import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

// ── Tracking members (replaces tracking.xlsx runtime data) ─────────────────
export const trackingMembers = sqliteTable('tracking_members', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  no:                 integer('no'),
  project:            text('project'),
  name:               text('name').notNull(),
  email:              text('email'),
  serial:             text('serial'),
  account:            text('account'),
  deviceType:         text('device_type'),
  malwareAlerts:      text('malware_alerts'),
  complianceChecks:   text('compliance_checks'),
  seedConfiguration:  text('seed_configuration'),
  operatingSystem:    text('operating_system'),
  followUpAction:     text('follow_up_action'),
  responseFromTicket: text('response_from_ticket'),
  trackingStatus:     text('tracking_status'),
  removedFromTracking: integer('removed_from_tracking', { mode: 'boolean' }).notNull().default(false),
  createdAt:          text('created_at'),
  updatedAt:          text('updated_at'),
});

// ── Submissions (replaces submissions.json) ────────────────────────────────
export const submissions = sqliteTable('submissions', {
  id:               integer('id').primaryKey({ autoIncrement: true }),
  account:          text('account').notNull(),
  submissionType:   text('submission_type').notNull(),
  imagePath:        text('image_path'),
  imageUrl:         text('image_url'),
  imageOriginalName:text('image_original_name'),
  imageSavedName:   text('image_saved_name'),
  status:           text('status').notNull().default('PENDING'),
  validationResult: text('validation_result'),
  validationChecklist: text('validation_checklist'),
  submissionDate:   text('submission_date').notNull(),
  confidenceScore:  real('confidence_score'),
  // Windows checks
  hasClock:                   integer('has_clock', { mode: 'boolean' }),
  hasWindowsUpdate:            integer('has_windows_update', { mode: 'boolean' }),
  hasDeviceName:               integer('has_device_name', { mode: 'boolean' }),
  hasDeviceSerial:             integer('has_device_serial', { mode: 'boolean' }),
  hasDashboard:                integer('has_dashboard', { mode: 'boolean' }),
  // Mac checks
  hasSeedDashboard:            integer('has_seed_dashboard', { mode: 'boolean' }),
  hasTrellix:                  integer('has_trellix', { mode: 'boolean' }),
  hasTimestamp:                integer('has_timestamp', { mode: 'boolean' }),
  hasMacInfo:                  integer('has_mac_info', { mode: 'boolean' }),
  // Thin checks
  hasThinVirusThreatProtection:      integer('has_thin_virus_threat_protection', { mode: 'boolean' }),
  hasThinAccountProtection:          integer('has_thin_account_protection', { mode: 'boolean' }),
  hasThinFirewallNetworkProtection:  integer('has_thin_firewall_network_protection', { mode: 'boolean' }),
  hasThinAppBrowserControl:          integer('has_thin_app_browser_control', { mode: 'boolean' }),
  hasThinDeviceSecurity:             integer('has_thin_device_security', { mode: 'boolean' }),
  hasThinDevicePerformanceHealth:    integer('has_thin_device_performance_health', { mode: 'boolean' }),
  hasThinWindowsUpdate:              integer('has_thin_windows_update', { mode: 'boolean' }),
  hasThinSerialNumber:               integer('has_thin_serial_number', { mode: 'boolean' }),
  // AI-extracted fields
  malwareAlerts:     text('malware_alerts'),
  complianceCheck:   text('compliance_check'),
  seedConfiguration: text('seed_configuration'),
  operatingSystem:   text('operating_system'),
  deviceSerial:      text('device_serial'),
  deviceName:        text('device_name'),
});

// ── Admins (replaces admins.json) ─────────────────────────────────────────
export const admins = sqliteTable('admins', {
  id:       text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  email:    text('email'),
  active:   integer('active', { mode: 'boolean' }).notNull().default(true),
});

// ── Attendance (from external attendance system) ──────────────────────────
export const attendance = sqliteTable('attendance', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  date:      text('date').notNull(),       // ISO date "YYYY-MM-DD"
  time:      text('time').notNull(),       // "HH:MM" or "HH:MM:SS"
  session:   text('session').notNull(),    // "AM" | "PM"
  accountId: text('account_id').notNull(),
  status:    text('status').notNull(),     // "ATTEND" | "LATE" | "ABSENT"
  remark:    text('remark'),
  createdAt: text('created_at').notNull(),
});

// ── Meta (version counter, replaces file mtime polling) ───────────────────
export const meta = sqliteTable('_meta', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

