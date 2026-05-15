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
  components/          # UI components for dashboard/admin
  lib/
    auth/              # JWT helpers
    services/          # AI, excel mapping/update/export, notifications
    storage/           # JSON admin/submission storage
    utils/             # file storage, magic bytes, renaming, tracking path
  middleware.ts        # admin route protection
```

## Implementation Notes
### Core Features
- **Submission pipeline** (`src/app/api/submission/route.ts`)
  - Validates account/type/file presence.
  - Checks `submissionType` support via mapping service.
  - Reads tracking rows early and rejects unknown accounts before AI call.
  - Validates image using magic-byte + MIME + extension + max size guard.
  - Calls AI service and enforces extracted device/account mismatch checks.
  - Enforces strict AI acceptance threshold: `confidence` must be exactly `100`.
  - Saves image only on AI pass, then persists submission JSON and triggers async tracking.xlsx update.

- **AI validation** (`src/lib/services/ai-validation.ts`)
  - Provider config from env with enable flag + execution order.
  - Type-specific prompt selection for windows/mac/thin.
  - Sequential fallback across configured providers.

- **Admin operations**
  - Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
  - User list merging of tracking rows and submissions + direct member CRUD persisted to `tracking.xlsx`: `src/app/api/admin/user-list/route.ts`.
  - Tracking file upload/download/update endpoints: `src/app/api/admin/tracking/route.ts`.
  - Report export: `src/app/api/admin/export/route.ts`.
  - Notification trigger: `src/app/api/admin/notify/route.ts`.

### Patterns & Best Practices
- Use dynamic Excel column detection (`buildColumnMap`) rather than fixed indexes.
- Keep admin route access centralized in middleware, not per-handler duplication.
- Normalize and compare account/serial/name values case-insensitively for tracking matches.
- Keep image URL generation storage-backend-agnostic via `/api/images/...`.

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
