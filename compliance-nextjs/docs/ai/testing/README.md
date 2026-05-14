---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
- Current repository has no formal automated test suite configured (`package.json` exposes `lint` only).
- Immediate goal: add coverage for critical API paths and validation logic.
- Priority coverage should focus on submission safety, auth protection, and tracking data integrity.

## Unit Tests
### Upload and validation utilities
- [ ] `magic-bytes.ts`: valid headers, MIME mismatches, extension mismatches, >10MB rejection.
- [ ] `image-rename.ts`: sanitization and filename format.
- [ ] `tracking-reader.ts`: header detection and account matching behavior.

### Service layer
- [ ] `ai-validation.ts`: provider ordering, disabled provider filtering, fallback success/failure.
- [ ] `excel-mapping.ts`: defaults vs Excel-loaded mappings and cache behavior.
- [ ] `excel-update.ts`: row match logic and SEED value extraction.

## Integration Tests
- [ ] `POST /api/submission`: end-to-end flow for approved vs rejected images.
- [ ] `POST /api/submission`: verify rejection when AI returns `valid=true` and `matchesType=true` but `confidence < 100`.
- [ ] Account mismatch and serial mismatch rejection paths against tracking rows.
- [ ] Admin auth middleware behavior for protected routes.
- [ ] Admin tracking upload/download/update endpoints with real workbook fixtures.
- [ ] `PUT /api/admin/user-list`: update project/name/email/serial/account/type/status and verify values persist in `tracking.xlsx`.
- [ ] `DELETE /api/admin/user-list?rowNum=...`: remove member row and verify list refresh + row numbering behavior.

## End-to-End Tests
- [ ] User dashboard submit → approval/rejection UI rendering.
- [ ] Admin login → user-list review/edit → export flow.
- [ ] Tracking month/year clear action and post-clear UI state.
- [ ] Notification send action success/error handling.

## Test Data
- Sample valid/invalid images for each supported format.
- Representative `tracking.xlsx` fixtures with varied header formats.
- Local JSON fixtures for submissions/admins.
- Mocked AI provider responses for deterministic behavior.

## Test Reporting & Coverage
- Current verification is primarily manual + linting.
- Add CI-stage reporting once automated tests are introduced.
- Track high-risk untested areas until test harness is implemented.

## Manual Testing
- Verify upload validations and error messages in dashboard UI.
- Verify admin route protection and session restore behavior.
- Verify Excel upload/download/edit operations with real files.
- Verify image rendering/downloading from both local and S3 modes.

## Performance Testing
- No formal performance suite currently.
- Suggested baseline: submission throughput under typical team usage and large image handling.

## Bug Tracking
- Track defects by area: submission pipeline, auth, tracking workbook ops, admin UX.
- For each fix, include regression checks for impacted API route and UI screen.
