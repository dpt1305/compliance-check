---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
Provide a web-based compliance submission and administration system that:
- lets users upload required device evidence (screenshots/images),
- validates evidence quality and type with AI plus file-level security checks,
- lets admins track submission status, manage tracking data, notify users, and export reports.

## Goals & Objectives
### Primary goals
- Secure submission endpoint with strong image validation (magic bytes + MIME + extension + size).
- AI-assisted compliance validation with provider fallback.
- Enforce strict acceptance policy: only AI confidence `100%` is accepted.
- Admin portal with authentication and operational tooling (user list, check-in table, notifications, export).
- Lightweight persistence without a database (JSON + Excel + image storage).

### Secondary goals
- Support both local image storage and S3-backed storage.
- Keep deployment simple for EC2 + PM2 + Nginx.
- Make tracking.xlsx the authoritative operational dataset for account/device mapping.

### Non-goals (current scope)
- Relational database support.
- Background scheduler/cron-based auto-reminder flow (manual reminder endpoint exists).
- Full observability stack (APM/metrics pipeline).

## User Stories & Use Cases
- As an end user, I submit `account + submissionType + image` and get immediate pass/fail feedback with reason.
- As an admin, I sign in and review compliance records, tracking status, and evidence images.
- As an admin, I can create/read/update/delete member information directly in User List, persisted to `tracking.xlsx`.
- As an admin, I upload/replace `tracking.xlsx` and edit tracking values.
- As an admin, I export reports and trigger reminder notifications.
- As an admin, I can clear submissions for a specific month/year and remove related images.
- As an admin, I can filter the User List by **project** using a searchable multi-select dropdown with a true-toggle "Select All" checkbox — selecting no projects shows all rows; deselecting all shows nothing.
- As an admin, I can filter the Check-in Table by **project** the same way, so only accounts belonging to selected projects appear as rows in the grid.
- As an admin, I can search the User List with tolerant fuzzy matching across member identity and device fields.
- As an admin, I can rely on the User List `No.` column to reflect the current filtered ordering I am reviewing.
- As an admin, I can download a ZIP package that contains only the currently filtered rows and their matching images.
- As a thin-client user, I can see the exact compliance requirements for my Thin submission type before uploading.
- As an admin, the User List and Check-in Table automatically refresh whenever any data changes (submission, member edit, tracking upload) — no manual page refresh required.
- As an admin, the User List loads the first 50 records immediately and fetches the next 50 automatically as I scroll down — all server-side filtering (project, period, tags) is applied before pagination so I always see accurate results.

## Success Criteria
- `POST /api/submission` accepts valid payloads and rejects invalid/unsafe uploads with descriptive errors.
- `POST /api/submission` rejects all AI results where `confidence !== 100`.
- Approved submissions are persisted with image URL, validation payload, confidence, and extracted device identifiers.
- Admin routes are inaccessible without valid JWT (`/api/admin/**`, `/admin/**`).
- User list and check-in table reflect merged data from tracking and submissions.
- Export and tracking download endpoints produce valid files.
- User List text filtering uses Fuse.js fuzzy search across `name`, `account`, `email`, `serial`, `project`, and `submissionType`.
- The User List `No.` column renders the 1-based position within the current filtered result set, not the original tracking row number.
- User List project filter uses `null` to mean "no filter" (all shown) and `[]` to mean "none selected" (0 rows); the "Select All" checkbox is a true toggle between these two states.
- Check-in Table project filter resolves `project` server-side by joining submissions with tracking rows by account; grid rows (accounts) reflect only the filtered projects.
- ZIP download exports only the currently visible filtered members, including a filtered Excel workbook and only their associated images — regardless of whether the active filter is text search, status, period, or any combination.
- Submission form keeps previously entered values after a successful APPROVED submission (values are not auto-cleared on success).
- Submission form clears the previous AI validation result when the user re-submits (stale result is not shown during a new submission attempt).
- When submission type is **Thin**, the form displays a pre-submission checklist of 8 required items the user must capture in their screenshot(s).
- Thin submissions are validated against all 8 checks; any failing check causes the submission to be rejected with the specific reason.
- Approved Thin submissions persist all 8 boolean check results as individual fields in the submission record.
- All structured data (submissions, tracking members, admins) is stored in SQLite; changes are atomic, consistent, and never lost due to file locking.
- Admin UI reflects any data change (new submission, member edit, tracking upload) within 1 second via SSE — no polling, no manual refresh.
- User List supports server-side cursor pagination (50 items per page); all filtering (project, period, tags) is applied server-side before pagination so results are always accurate regardless of how many records are loaded.
- Windows compliance screenshots require: system clock, Windows Update status, device name, and device serial number — the Trellix security status condition has been removed from Windows validation.

## Constraints & Assumptions
- Stack is Next.js 15 (App Router) with API routes; no separate Spring Boot/Angular service in this repository.
- Persistence is **MongoDB** for structured runtime data:
  - `MONGODB_URI` — required MongoDB connection string.
  - `STORAGE_IMAGE_PATH` or S3 for image files (unchanged).
  - Legacy JSON files (`submissions.json`, `admins.json`) are still available as seed data on first startup.
- Excel (`tracking.xlsx`) remains the **import/export format** to move data between environments (local ↔ production), while runtime reads/writes go through MongoDB.
- Supported image formats: JPG/JPEG/PNG/WEBP, max 10MB.
- Default admin seed exists (`admin` / `Admin@123`) and must be changed in production.
- AI providers depend on external endpoints and keys.
- Each environment (local, production) has its own independent SQLite file — no cross-environment sync at the DB level.

## Questions & Open Items
- Should automated deadline reminders (scheduled job) be implemented in-app or externalized?
- Should route-level rate limiting be enforced in middleware/API handlers (env exists but not yet wired)?
- Should additional device types beyond `windows`, `mac`, `thin` be added to mapping defaults?

## SQLite Migration

### Why SQLite?
File-based Excel/JSON storage was unstable: concurrent writes caused file lock errors (`EBUSY`/`EPERM`), mtime polling for change detection was unreliable, and in-flight writes occasionally left data in an inconsistent state. SQLite with WAL mode resolves all three issues with true atomicity and zero extra infrastructure.

### What moved to SQLite
| Legacy source | SQLite table |
|---|---|
| `submissions.json` | `submissions` |
| `admins.json` | `admins` |
| `tracking.xlsx` (runtime reads/writes) | `tracking_members` |

### Auto-migration on first startup
`src/lib/db/migrate.ts` is called at login time (first admin request). It checks if each table is empty and, if so, seeds from the legacy file. Subsequent startups skip migration entirely (idempotent).

### Excel import/export flow (unchanged UX)
- **Upload** (`POST /api/admin/tracking` multipart): parses xlsx → `replaceAll()` into SQLite + saves disk backup.
- **Download** (`GET /api/admin/tracking`): generates fresh xlsx from DB rows on the fly — no stale file.
- **Filtered ZIP export** (`POST /api/admin/tracking` JSON): builds filtered xlsx from DB rows + matching images.

### Environment isolation
Each environment has its own `compliance.db`. Upload `tracking.xlsx` from one environment, download it from another — this is the approved sync mechanism, same as before.

## Real-Time UI Updates

### Requirement
Admin pages (User List, Check-in Table) must reflect data changes instantly — without manual refresh and without the instability of mtime polling.

### Implementation: Server-Sent Events (SSE)
- **Server**: `GET /api/admin/events` — persistent SSE stream protected by JWT (cookie or Bearer header).
- **Event format**: `data: {"scope":"tracking","ts":1234567890}\n\n`
  - `scope: "tracking"` — fired on any `tracking_members` insert/update/delete/replace.
  - `scope: "submissions"` — fired on any submission save/delete.
- **Event bus**: `src/lib/db/event-bus.ts` — Node.js `EventEmitter` singleton shared across hot-reloads (`globalThis._eventBus`), max 500 listeners.
- **Emission points**:
  - `bumpTrackingVersion()` in `src/lib/db/index.ts` → emits `"tracking"`.
  - `save()`, `deleteById()`, `deleteByPeriod()` in `submission-repo.ts` → emit `"submissions"`.

### Client hook
`src/hooks/useAdminEvents.ts` — React hook:
```typescript
useAdminEvents({ onTracking: loadData, onSubmissions: loadData });
```
- Opens `EventSource('/api/admin/events')` once on mount using the session cookie.
- Calls `onTracking` or `onSubmissions` immediately when an event arrives.
- Browser auto-reconnects on network error.
- Heartbeat comment (`:`) sent every 25 s keeps proxies alive.
- Callbacks stored in a ref — never restarts the connection when callbacks change.
- Replaces the old 15-second `setInterval` polling in `UserList.tsx`.

### Success criteria
- User List and Check-in Table update within < 1 s of a DB write from any source (form submission, admin edit, tracking upload).
- No page refresh or manual action required.
- Connection survives background tabs (EventSource reconnects automatically).

## Project Filter (User List & Check-in Table)

### Requirement
Admins need to narrow both the User List table and the Check-in grid to one or more specific projects without losing the ability to quickly reset to "show all".

### Multi-select dropdown spec
- Searchable dropdown listing all distinct `project` values from `tracking.xlsx`.
- **Select All** checkbox at the top — a **true toggle**:
  - ON (default) → no filter, all rows shown.
  - Click when ON → turns OFF, all individual checkboxes become unchecked.
  - Click when OFF or partial → turns ON, all items checked, filter cleared.
- Selecting all items individually auto-snaps "Select All" back to ON.
- Button label: `All projects` (all ON) · `None selected` (all OFF) · `Project Name` (one selected) · `N selected` (multiple).

### Check-in Table specifics
- The API resolves `project` by joining submission `account` values against tracking rows — submissions have no project field of their own.
- Grid rows (accounts) and column types both shrink to match the filtered project set.

## Newly Added Admin Filtering & Export Features
### Fuzzy search in User List
- Replace simple substring matching with Fuse.js-based fuzzy search.
- Search scope includes `name`, `account`, `email`, `serial`, `project`, and `submissionType`.
- Fuzzy text filtering must compose with existing status and period filters rather than bypass them.

### Filter-aware numbering
- The `No.` column must display the current 1-based position inside the filtered result set.
- Display numbering must update immediately when text, status, or period filters change.
- The displayed number is a UI/export ordering value and is no longer tied to the original `tracking.xlsx` row index.

### Filtered ZIP export
- ZIP generation must respect **any** active filter — text search, status, period month/year, or a combination.
- When any filter is active the download button shows "Download Filtered ZIP (N)" with the current visible member count; when no filter is active it downloads the raw `tracking.xlsx`.
- The bundled Excel file must contain only the rows visible after filtering, with `No.` values reflecting the filtered ordering.
- Included images must be limited to the filtered members and named `<NN>_<Name>.<ext>`, where `NN` is the zero-padded filtered position and `Name` preserves the member's display name including spaces.
- Excel row ordering and image numbering must stay aligned with the filtered table order shown to the admin.
- Download filename: `tracking_Month_Year.zip` when a period filter is active; `tracking_filtered.zip` for text/status-only filters.

## Thin Client Compliance Requirements

### Pre-submission checklist displayed on form
When a user selects **Thin** as the submission type, the form shows 8 required items they must include in their screenshot(s):

| # | Item | Expected state |
|---|------|----------------|
| 1 | Virus & threat protection | Green tick (Windows Security) |
| 2 | Account protection | Green tick (Windows Security) |
| 3 | Firewall & network protection | Green tick (Windows Security) |
| 4 | App & browser control | Green tick (Windows Security) |
| 5 | Device security | Green tick (Windows Security) |
| 6 | Device performance & health | "No action needed" (Windows Security) |
| 7 | Windows Update | "Up to date" (Settings → Windows Update) |
| 8 | Serial Number in Terminal | Terminal output (PowerShell/CMD) showing device serial |

### AI validation for Thin
- All 8 checks are verified by the AI prompt.
- If **any** check fails → `valid: false`, submission rejected with the failed check listed.
- If all pass → `valid: true`, submission accepted.
- The device serial number is extracted from the terminal output and stored in `deviceSerial`.

### Submission record fields (Thin-specific)
Persisted to `submissions.json` as individual boolean fields on each approved Thin record:
- `hasThinVirusThreatProtection`
- `hasThinAccountProtection`
- `hasThinFirewallNetworkProtection`
- `hasThinAppBrowserControl`
- `hasThinDeviceSecurity`
- `hasThinDevicePerformanceHealth`
- `hasThinWindowsUpdate`
- `hasThinSerialNumber`
- `deviceSerial` (extracted serial number text)

## Submission Form Behaviour
- After a successful APPROVED submission the form **retains** all field values so the user can reference what was submitted.
- When the user initiates a new submission attempt any previously displayed AI validation result is **cleared immediately**, preventing stale results from being visible during the new request.
