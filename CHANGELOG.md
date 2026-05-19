# Changelog

All notable changes to this project will be documented in this file.

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
