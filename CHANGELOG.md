# Changelog

All notable changes to this project will be documented in this file.

---

## [0.4.0] — 2026-05-20

### Added

#### MongoDB Repository Layer (opt-in, zero-downtime migration)
- New provider factory: when `MONGODB_URI` is set, all data operations route to MongoDB; when unset, SQLite remains the default — no code change required
- Created `src/lib/db/mongo/` with full implementations for all 4 repos: `submission-repo.ts`, `admin-repo.ts`, `tracking-repo.ts`, `attendance-repo.ts`
- `_counters` collection provides auto-increment IDs for submissions, tracking members, attendance, and tracking version
- Auto-migration on first startup (`mongo/migrate.ts`): copies all SQLite data → MongoDB, idempotent (skips if data already exists)
- Proxy pattern: top-level `src/lib/db/*-repo.ts` files delegate to Mongo or SQLite depending on `isMongoEnabled()`
- All API routes updated to `await` previously-synchronous repo calls
- `attendance-repo.ts` (previously a direct SQLite import missed in initial pass) fully migrated through the same proxy pattern

#### SSE Polling Fallback
- `useAdminEvents.ts` now probes SSE for 3 seconds on connect; if the connection errors before the first message arrives, it automatically switches to **5-second polling**
- Polling targets: `GET /api/admin/tracking/version` (returns `{ mtime }`) and `GET /api/admin/submissions?_poll=1` (returns `{ total, ts }`)
- Ensures real-time-like updates work on serverless hosts (Vercel free plan) where SSE connections may be dropped between function invocations

#### Image Upload Zone
- File upload **button replaced with a full drop zone**: supports click-to-browse, drag & drop, and **Ctrl+V paste from clipboard**
- **Thumbnail preview** shown inside the drop zone once a file is selected (full opacity when valid, dimmed when invalid)
- **✕ clear button** (top-right corner of the zone) removes the selected file, resets validation state, and revokes the object URL to prevent memory leaks
- Preview works for all three input methods (file picker, drag-drop, clipboard paste) via `useCallback`-stabilised `applyFile`

### Changed

#### Tag Filter Logic: AND → OR
- Admin user list tag search changed from **AND** (row must match every tag) to **OR** (row must match any tag)
- Affects `src/app/api/admin/user-list/route.ts` server-side filter

#### Excel Export Column Updates (`tracking.xlsx`)
- Column headers renamed to match the reporting spec:
  `No. | Project | Name | Email | Serial | Account | Device Type | Malware Alerts | Compliance Checks | Seed Configuration | Operating System | Follow Up Action | Response From Ticket | Tracking Status`
- `EVD / Ticket` column defaults to `"Refer photo captured in folder"` when `responseFromTicket` is empty
- Empty `Note` column appended as the final column
- Applies to both the full GET export and the filtered POST export

#### Thin Client AI Validation — Replaced Security-at-a-Glance with Full Scan
- Old 6 Windows Security home-screen checks (virus protection, account protection, firewall, app/browser, device security, device health) **commented out** in prompt and checklist — preserved in code for easy revert
- New 3 required checks with **strict physical-visibility rules**:
  1. **FULL_SCAN** — Scan Options page must be visible showing completed full scan, "No current threats", "0 threats found", scan date, and file count
  2. **WINDOWS_UPDATE** — Windows Update page heading AND "You're up to date" text must both be physically visible; Windows Security page is explicitly NOT Windows Update
  3. **SERIAL_NUMBER** — terminal window (PowerShell / CMD) must be visible with serial number output; line-wrapping is acceptable
- `ValidationGuidance.tsx` checklist updated to show the 3 active items; old 6 items commented inline
- `hasThinVirusThreatProtection` DB field reused to store `hasFullScan` result

### Fixed

- **Windows Update false positive**: added `HARD BLOCK` list to `THIN_PROMPT` explicitly naming "Windows Security / Scan Options page is NOT Windows Update" — prevents AI from inferring update status from a completed scan result
- **Serial number wrapping**: AI no longer fails validation when serial number output wraps to the next terminal line
- **Clipboard paste thumbnail**: `applyFile` converted to `useCallback` and declared as a dependency of the paste `useEffect`, eliminating the stale closure that caused the thumbnail to be skipped for pasted images
- **`_id` field leaked in attendance API response**: `insertOne()` mutates the document with `_id`; fixed by destructuring `{ _id, ...clean }` before returning

---

## [0.3.0] — 2026-05-19

### Added

#### Admin Review Modal
- New **🔍 Review (N)** button in the admin User List toolbar (next to the Reload button)
- `N` shows the true total submitted count from the API summary — always accurate regardless of scroll position
- Clicking opens a full-screen review modal that covers all submissions matching the current filter
- **Left pane** displays all submission data:
  - Member info (name, email, project, serial, device type)
  - Submission metadata (type, date, AI confidence score)
  - **SEED dashboard tiles** — 2×2 colored grid (teal = 0 good, amber = >0 attention, gray = no data); click any tile to edit inline, Enter saves, Escape cancels, blur auto-saves
  - AI reason, compliance checklist (pass/fail badges), failed checks, guidelines, AI suggestion
- **Right pane** shows the submission image at full size (`object-fit: contain`, dark background) so admins can assess at a glance
- **Footer action buttons**: ⏸ Pending / ✕ Reject / ✓ Approve — updates submission status immediately
- **Navigation**: left/right arrow buttons on modal edges + keyboard `←` / `→` / `Esc`
- SEED tile edits sync back to `PUT /api/admin/tracking` and update both the paginated list and full review list
- `validationResult` field added to `UserListEntry` interface and `GET /api/admin/user-list` response — enables the modal to show AI checklist data without a second API call

#### Excel Export — Derived Status Column
- Exported tracking Excel now derives the `Status` column from actual submission status:
  - `APPROVED` → `"OK"`
  - Any other status or no submission → `"Rejected"`
- Applies to both full GET export and filtered POST ZIP export
- `buildRowStatusMap()` helper joins tracking rows to submissions using the same `matchesTrackingRow` normalisation as the user-list route

### Changed

- **Mac SEED detection fix** — `MAC_PROMPT` now explicitly requests `seedDashboard` integers (seedConfiguration, seedOs, seedMalware, seedNetwork) directly from the SEED tile UI values, with an explicit instruction not to copy the device serial number. Prevents regression where serial digits (e.g. `L4YPY29KJJ` → `29`) were incorrectly matched to SEED keyword patterns in the free-text `reason` field
- **SEED value display** — added `numOnly()` helper that strips suffix text (e.g. `"29 actions"` → `"29"`) in all 4 SEED table columns and in the review modal tiles
- **Submission form placeholder** — Account ID input placeholder updated to `"e.g. HuyenTP"` to give users a realistic format example
- **Review modal image** — switched from `<iframe>` to `<img object-fit: contain>` with dark background so the full image is visible at 100% without browser chrome or scrollbars

### Fixed

- `AiValidationResult` `seedDashboard` field types widened to `string | number | null` to handle AI responses that return integer tile values as strings
- `toNumberOnly()` in `excel-update.ts` signature widened to accept `string | number | null | undefined`

---

## [0.2.0] — 2026-05-14

### Added

#### Tag-Based Search
- Replaced plain text search input with a **tag chip system**: type a word and press **Enter** to add a search tag
- Multiple tags narrow results with **AND logic** — a row must match every tag
- Each tag is matched as a **case-insensitive substring** across all 19 table fields (name, account, email, serial, project, type, status, malware alerts, compliance checks, SEED config, OS, follow-up action, response, tracking status, submission status, device serial, device name, source, tracking account)
- **Backspace** on empty input removes the last chip; **✕** button clears all tags at once

#### Dynamic Filter by Type
- Replaced the static "filter by status" dropdown with a **dynamic filter by Type** dropdown
- Type options are derived at runtime from distinct `deviceType` values in the loaded tracking Excel — no code change needed when new types are added
- Type filter runs **before** tag search (higher priority), ensuring type is always the dominant filter

#### Thin Client Compliance Validation
- New AI validation prompt for `type=Thin` with **8 required checks**:
  1. Virus & threat protection — green tick
  2. Account protection — green tick
  3. Firewall & network protection — green tick
  4. App & browser control — green tick
  5. Device security — green tick
  6. Device performance & health — "No action needed"
  7. Windows Update screen — Up to date
  8. Terminal/command line showing serial number
- Form checklist displayed when type is Thin so users know what to capture before submitting
- All 8 checks stored as individual boolean fields on the submission record (`hasThinVirusThreatProtection`, `hasThinAccountProtection`, etc.)
- `deviceSerial` extracted from terminal output and persisted to the submission record
- Submission rejected if any check fails; reason returned to the user

#### Filtered ZIP Export Improvements
- Filtered ZIP export now triggers on **any active filter** (tags / type / period) — previously only triggered when a period (month + year) filter was set
- Download button label updates dynamically: **"Download Filtered ZIP (N)"** when filters are active, showing the count of matched members
- ZIP contains only the members currently visible on screen; the bundled `tracking.xlsx` reflects the same filtered subset

#### Add Member Defaults
- New members added via the Add Member popup now receive these default values in `tracking.xlsx`:
  - **Status** → `Ok`
  - **Follow Up Action** → `Default`
  - **Response From Ticket** → `Refer photo captured in folder`

### Changed

- **Add Member popup**: removed the "Tracking Status" field — status is managed separately after a submission is made
- **Image filenames in ZIP**: spaces and accented/Vietnamese characters are now preserved in filenames (e.g. `01_Nguyen Van A.jpg`)
- **Submission form**: form retains entered values after a successful (APPROVED) submission; stale AI result is cleared when the user re-submits

### Removed

- **Fuse.js** dependency removed (`fuse.js` uninstalled from `package.json`); search now uses plain substring matching which is faster, predictable, and requires no configuration

---

## [0.1.1] — Pre-release fixes

### Added

- **Tag-based search** (early iteration): admin can type a keyword in the search bar and press **Enter** to add it as a search tag; the table filters in real time matching against all visible fields
- **Inline member editing on the web**: admin can edit member details (name, email, serial, account, type, project) directly in the browser without touching the Excel file — changes are written back to `tracking.xlsx` on the server immediately

### Changed

- **Exported image filename format** changed from `{No}_{Name}` to **`{SN}_{Full Name}`** (serial number prefix instead of sequence number), making each image file uniquely identifiable by device serial
- **No. column in filtered ZIP export** reflects the filtered sequence (1, 2, 3…) rather than the original tracking row number, so the exported Excel and image filenames stay in sync

### Fixed

- **Confidence score 100% now correctly passes validation** — previously a score of exactly 100 was mishandled by the comparison logic and could be treated as a failure; the check now accepts `confidence >= threshold`
- **Submission API response** was returning only a number (the submission ID) instead of a full response object; now returns a structured JSON body with `id`, `status`, and validation result so the frontend can display feedback correctly

---

## [0.1.0] — Initial release

- User compliance submission form (account, image upload, type selection)
- AI image validation via Gemini / ChatGPT with provider fallback
- Admin site: user list, inline edit, check-in table, period filter, Excel export
- Tracking Excel upload/download and filtered ZIP export
- JWT-based admin authentication
- JSON file-based storage (no database required)
- Add Member / Edit Member / Delete Member in admin UI
