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

## Success Criteria
- `POST /api/submission` accepts valid payloads and rejects invalid/unsafe uploads with descriptive errors.
- `POST /api/submission` rejects all AI results where `confidence !== 100`.
- Approved submissions are persisted with image URL, validation payload, confidence, and extracted device identifiers.
- Admin routes are inaccessible without valid JWT (`/api/admin/**`, `/admin/**`).
- User list and check-in table reflect merged data from tracking and submissions.
- Export and tracking download endpoints produce valid files.

## Constraints & Assumptions
- Stack is Next.js 15 (App Router) with API routes; no separate Spring Boot/Angular service in this repository.
- Persistence is file-based:
  - `STORAGE_JSON_PATH` for submissions,
  - `STORAGE_JSON_ADMIN_PATH` for admins,
  - `EXCEL_UPDATE_PATH` for tracking workbook,
  - `STORAGE_IMAGE_PATH` or S3 for images.
- Supported image formats: JPG/JPEG/PNG/WEBP, max 10MB.
- Default admin seed exists (`admin` / `Admin@123`) and must be changed in production.
- AI providers depend on external endpoints and keys.

## Questions & Open Items
- Should automated deadline reminders (scheduled job) be implemented in-app or externalized?
- Should route-level rate limiting be enforced in middleware/API handlers (env exists but not yet wired)?
- Should admin credential bootstrap be moved from login-time init to startup/init script?
- Should additional device types beyond `windows`, `mac`, `thin` be added to mapping defaults?
