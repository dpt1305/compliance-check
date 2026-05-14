---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
- [x] Milestone 1: Core submission + AI validation flow delivered.
- [x] Milestone 2: Admin auth + admin operational pages delivered.
- [x] Milestone 3: Tracking.xlsx integration + export/notification flows delivered.

## Task Breakdown
### Completed baseline work
- [x] Submission endpoint with validation and AI provider fallback.
- [x] Mapping APIs and dynamic type loading from Excel/default mappings.
- [x] Admin login/logout/session restoration and middleware protection.
- [x] User list merge model (tracking + submissions), inline edits, add member, month/year clearing.
- [x] Check-in table, Teams/direct notification trigger, Excel export, tracking download/upload/update.
- [x] Optional S3-backed image storage with local fallback.

### Next prioritized hardening tasks
- [ ] Implement route-level rate limiting using existing env toggles (`RATE_LIMIT_*`).
- [ ] Add automated reminder scheduling (currently manual send only).
- [ ] Add automated test suites for API and critical UI flows.
- [ ] Move default admin initialization to app startup/init path (instead of login side effect).

## Dependencies
- AI validation depends on valid provider API keys/endpoints.
- S3 image mode depends on bucket + IAM credentials/role.
- Tracking-linked features depend on valid `tracking.xlsx` availability.
- Admin workflows depend on JWT secret stability and cookie/header token handling.

## Delivery Approach
- Keep current file-based architecture stable first (correctness + safety).
- Add operational resilience features second (rate limit + scheduler + tests).
- Revisit data scalability options only after operational needs exceed JSON/Excel model.

## Risks & Mitigation
- **External AI instability or quota limits** → preserve provider fallback and explicit error messaging.
- **Manual data corruption in uploaded tracking workbook** → keep dynamic column detection and strict upload validation.
- **Credential/security misconfiguration in production** → enforce secret setup and rotate default admin password immediately.

## Resources Needed
- Next.js/TypeScript maintainers familiar with API routes and file I/O.
- Access to AI provider credentials and Teams webhook.
- EC2 + PM2 + Nginx runtime (or equivalent containerized runtime).
- Controlled operational ownership for Excel schema and tracking data quality.
