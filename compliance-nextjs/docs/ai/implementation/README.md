---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
- Node.js 24+ (`package.json` engines).
- Install dependencies with `npm ci` in `compliance-nextjs/`.
- Configure `.env.local` from `.env.local.example` for local run.
- Run with `npm run dev`.

## Code Structure
```
src/
  app/                 # Next.js pages + API routes
    api/
      admin/
        events/        # SSE real-time stream endpoint
        checkin-table/ # Check-in grid data
        export/        # Excel report export
        submissions/   # Submission CRUD
        tracking/      # Tracking xlsx upload/download/export + PUT seed update
          version/     # DB tracking_version counter
        user-list/     # Member list + CRUD
      auth/            # login / logout / me
      submission/      # User-facing submission endpoint
  components/
    admin/
      CheckInTable.tsx
      MultiSelectDropdown.tsx
      UserList.tsx
  hooks/
    useAdminEvents.ts  # SSE hook for real-time UI updates
  lib/
    auth/              # JWT helpers
    db/                # MongoDB repository layer
      index.ts         # Tracking version helpers
      tracking-repo.ts # tracking_members CRUD + matching helpers
      submission-repo.ts # submissions CRUD
      admin-repo.ts    # admins CRUD + default seed
      migrate.ts       # Auto-seeder from legacy files (runs once on startup)
      event-bus.ts     # Node.js EventEmitter singleton for SSE
    services/          # AI, excel mapping/update/export, notifications
    storage/           # Legacy JSON storage (kept for type compatibility only)
    utils/             # file storage, magic bytes, renaming, tracking path
  middleware.ts        # admin route protection
```

## Implementation Notes
### Core Features
- **Submission pipeline** (`src/app/api/submission/route.ts`)
  - Validates account/type/file presence.
  - Checks `submissionType` support via mapping service.
  - Reads tracking rows from SQLite and rejects unknown accounts before AI call.
  - Validates image using magic-byte + MIME + extension + max size guard.
  - Calls AI service and enforces extracted device/account mismatch checks.
  - Enforces strict AI acceptance threshold: `confidence` must be exactly `100`.
  - Saves image only on AI pass, then persists submission to SQLite and triggers async tracking DB update.
  - Saving a submission emits `"submissions"` change event → all connected SSE clients refresh instantly.

- **AI validation** (`src/lib/services/ai-validation.ts`)
  - Provider config from env with enable flag + execution order.
  - Type-specific prompt selection for windows/mac/thin.
  - Sequential fallback across configured providers.

- **Admin operations**
  - Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
  - User list: merges SQLite `tracking_members` + `submissions` + direct member CRUD — `src/app/api/admin/user-list/route.ts`.
  - Tracking: upload xlsx → parse → `replaceAll()` into SQLite (+ disk backup); download → generate xlsx from DB; filtered ZIP from DB rows — `src/app/api/admin/tracking/route.ts`.
  - Report export: `src/app/api/admin/export/route.ts`.
  - Notification trigger: `src/app/api/admin/notify/route.ts`.
  - Real-time stream: `src/app/api/admin/events/route.ts` (SSE).

### Patterns & Best Practices
- All structured reads/writes go through the SQLite repos (`tracking-repo`, `submission-repo`, `admin-repo`). Legacy JSON/Excel files are no longer the live data source.
- Use `bumpTrackingVersion()` after every mutation to tracking_members — it atomically increments the version counter **and** emits the SSE change event.
- Keep admin route access centralized in middleware, not per-handler duplication.
- Normalize and compare account/serial/name values case-insensitively for tracking matches.
- Keep image URL generation storage-backend-agnostic via `/api/images/...`.
- SQLite WAL mode (`PRAGMA journal_mode = WAL`) allows concurrent reads without blocking writes.
- DB singleton stored on `globalThis._db` for Next.js hot-reload safety in dev.

## Integration Points
- AI providers (chat completion compatible endpoints) via Bearer auth.
- AWS S3 for optional image object storage + presigned retrieval.
- Teams incoming webhook for reminder notifications.

## Project Filter (User List & Check-in Table)

### Behavior
- Both **User List** and **Check-in Table** share a `MultiSelectDropdown` component for project filtering.
- The dropdown shows all distinct project values loaded from `tracking.xlsx`.
- `selected = null` → **Select All ON** — no filter active, all rows/accounts shown (default state).
- `selected = []` → **Select All OFF** — nothing is checked; filter produces 0 rows.
- `selected = ['ProjectA', 'ProjectB']` → filter to those projects only.

### Select All toggle
- Clicking "Select All" when it is **ON** (all shown) → turns **OFF** (`onChange([])`), unchecking every individual item.
- Clicking "Select All" when it is **OFF** or partially selected → turns **ON** (`onChange(null)`), checking all items.
- Checking every individual item manually auto-normalizes back to `null` (Select All ON).

### Check-in Table — project join
- The check-in API (`GET /api/admin/checkin-table`) joins submission records with tracking rows by `account` to resolve the `project` field.
- Only accounts that belong to the selected projects appear as rows in the grid.
- The `accounts` and `types` used to build the grid matrix are derived from `filteredEntries` (post-filter), not the full dataset.

### User List — filter precedence
1. Month/year period mask applied first.
2. Project filter applied to the masked result.
3. Tag (fuzzy) search applied last.

All three steps occur **server-side** inside `GET /api/admin/user-list` before pagination.

## Server-Side Cursor Pagination (User List)

### Requirement
Load 50 items initially, then append the next 50 automatically as the admin scrolls down. Filtering must take priority — results must always reflect the active filters, not a stale pre-filtered snapshot.

### How it works
- `GET /api/admin/user-list` accepts `offset`, `limit` (default 50), `project[]`, `month`, `year`, `tag[]` query params.
- The route builds the full joined+filtered result set in memory, applies `offset`/`limit`, and returns:
  ```json
  { "items": [...], "total": 42, "projects": [...], "summary": { "approved": 10, "submitted": 15, "notSubmitted": 27 } }
  ```
- `total` and `summary` reflect the **full** filtered set, not just the current page — summary chips are always accurate.
- `projects` list is fetched fresh from `getDistinctProjects()` (DB query) on each request.

### Client implementation (`UserList.tsx`)
- `loadPage(offset, reset)` — stable `useCallback` with no deps; reads current filter state via `filterStateRef`.
- `filterStateRef` is updated synchronously whenever any filter state changes, then `loadPage(0, true)` is called to reset to page 1.
- SSE events call `loadData()` (= `loadPage(0, true)`) via stable reference stored in `useAdminEvents` ref.
- `IntersectionObserver` on `sentinelRef` calls `loadPage(items.length, false)` to append the next page when the sentinel scrolls into view.
- No `visibleCount` or `showAll` toggle — pagination is entirely server-driven.

### Filter-aware ZIP download
When exporting a filtered ZIP, the frontend makes a pre-fetch with `limit=99999` to collect all filtered IDs, then POSTs them to the tracking ZIP endpoint. This avoids sending only the currently loaded page.

## Windows Compliance Requirements (Updated)

Windows screenshot validation requires **4 items** — the Trellix security status condition has been **removed**:

| # | Item | Required |
|---|------|----------|
| 1 | System Clock | ✅ Bottom-right taskbar |
| 2 | Windows Update | ✅ "You're up to date" screen |
| 3 | Device Name | ✅ Fully visible, not truncated |
| 4 | Device Serial Number | ✅ Fully visible, not truncated |

- `hasTrellix` is now a **Mac-only** checklist field.
- `hasDashboard` (SEED dashboard) is no longer required for Windows — removed from Windows checklist and AI prompt.
- The `WINDOWS_PROMPT` in `ai-validation.ts` validates clock, update, device name, and serial only.


- APIs return clear JSON messages for validation/auth failures.
- AI service logs provider failures and continues fallback.
- Tracking/Excel update uses guarded writes with explicit server-side logs on failure.

## Performance Considerations
- Mapping data is cached in memory after initial load.
- Submission flow avoids unnecessary storage writes for invalid/rejected uploads.
- Image serving redirects to presigned S3 URL in view mode to reduce server proxy overhead.

## Security Notes
- JWT auth on admin API and pages.
- Upload content validation with magic-byte checks to prevent disguised files.
- Path traversal protection in image serving/storage helpers.
- Secrets sourced from environment variables.

---

## Mac SEED Dashboard Detection Fix

### Problem
Mac submissions were returning incorrect SEED metric values — e.g., `seedConfiguration` reporting `29` instead of `0`. The device serial number `L4YPY29KJJ` contained digits that were extracted from the free-text `reason` string when `buildSeedValues()` fell back to regex matching.

### Root Cause
`MAC_PROMPT` did not explicitly ask the AI to return `seedDashboard` integer values. `buildSeedValues()` in `excel-update.ts` fell back to `extractNumber(reason, keywords)` which scanned the free-text `reason` field — where the serial number digits appeared near SEED-related keywords.

### Fix
- **`ai-validation.ts`** — `MAC_PROMPT` now explicitly requests all four `seedDashboard` integers (`seedConfiguration`, `seedOs`, `seedMalware`, `seedNetwork`) from the SEED tile UI, with a warning: _"Do NOT copy values from the device serial number"_.
- **`AiValidationResult` interface** — `seedDashboard` field types widened from `number | null` to `string | number | null` to accept AI responses that return them as strings.
- **`excel-update.ts`** — `toNumberOnly()` signature widened to accept `string | number | null | undefined`.

---

## Admin Review Modal

A full-screen review flow was added to the admin User List so admins can quickly assess and approve/reject all submissions without leaving the page.

### Location
`src/components/admin/UserList.tsx`

### Feature Details

#### Toolbar Button
- A **🔍 Review (N)** button sits in the toolbar row next to the Reload button.
- `N` reflects `summary.submitted` from the API — always the true total count for the active filter, not limited to the current scroll position.
- Clicking it opens the review modal starting at the first submission.

#### Review Modal Layout
- **Left pane (w-80)** — submission metadata + SEED dashboard tiles + AI validation output:
  - Member info (name, email, project, serial, device type)
  - Submission meta (type, date, confidence score)
  - **SEED dashboard** — 2×2 colored tile grid:
    - Teal background → value is `0` (good)
    - Amber background → value is `> 0` (needs attention)
    - Gray background → no data
    - Click any tile to edit inline; Enter saves, Escape cancels, blur auto-saves
    - Saves via `PUT /api/admin/tracking` and updates both the paginated list and review list
  - AI reason text
  - Compliance checklist (pass/fail badges)
  - Failed checks list
  - Guidelines list
  - AI suggestion tip
- **Right pane** — full-size image viewer:
  - Uses `<img>` with `object-fit: contain` on a dark (`bg-gray-900`) background
  - Image fills the full available pane at 100% without cropping
  - "↗" link in the header opens the image in a new tab for detailed zoom

#### Navigation
- Left/right arrow buttons on the sides of the modal
- Keyboard `←` / `→` navigate between submissions
- Keyboard `Esc` closes the modal (or cancels a SEED tile edit if one is active)
- While a SEED tile is being edited, arrow/Esc navigation is blocked until the edit is committed or cancelled

#### Status Actions (footer)
Three buttons in the modal footer update submission status:
| Button | Status set | Color |
|---|---|---|
| ⏸ Pending | `PENDING` | Amber |
| ✕ Reject | `REJECTED` | Red |
| ✓ Approve | `APPROVED` | Green |

The current status is reflected as a badge in the modal header. Already-active status buttons are disabled.

#### Double-Save Prevention
`seedSavingRef` (a `useRef<boolean>`) is set synchronously before any async work in `saveSeedField`. This prevents the race condition where pressing Enter (triggering save) and the resulting blur event both call `saveSeedField` simultaneously.

---

## Excel Export — Status Column Logic

**File:** `src/app/api/admin/tracking/route.ts`

The exported tracking Excel now derives the `Status` column value from the actual submission status rather than a raw stored field:

| Submission status | Exported Status value |
|---|---|
| `APPROVED` | `OK` |
| `REJECTED` / `PENDING` / none | `Rejected` |

### Implementation
- `deriveTrackingStatus(submissionStatus)` helper converts status strings.
- `buildRowStatusMap(trackingRows, submissions)` joins tracking rows to submissions using `matchesTrackingRow` (same normalised account/serial matching used in the user-list route).
- Both the GET (full export) and POST (filtered ZIP) paths use the derived status.
- Rows with no matching submission → status defaults to `"Rejected"`.

---

## SEED Numeric Value Display

SEED values stored in the tracking DB may contain suffixes like `"29 actions"` or `"0 actions"` from older data. A `numOnly(v)` helper extracts only the first integer:

```ts
function numOnly(v: unknown): string | null {
  if (v == null || v === '') return null;
  const m = String(v).match(/\d+/);
  return m ? m[0] : null;
}
```

Applied in:
- All 4 SEED column `renderCell` calls in the user list table
- SEED tile display and `parseInt` color logic in the review modal
- SEED tile pre-fill value when clicking to edit

---

## Submission Form UX

**File:** `src/components/dashboard/DashboardForm.tsx`

The Account ID input placeholder was updated to `"e.g. HuyenTP"` to give users a realistic example format.
