# Changelog

All notable changes to this project will be documented in this file.

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

## [0.1.0] — Initial release

- User compliance submission form (account, image upload, type selection)
- AI image validation via Gemini / ChatGPT with provider fallback
- Admin site: user list, inline edit, check-in table, period filter, Excel export
- Tracking Excel upload/download and filtered ZIP export
- JWT-based admin authentication
- JSON file-based storage (no database required)
- Add Member / Edit Member / Delete Member in admin UI
