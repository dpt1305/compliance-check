---
phase: monitoring
title: Monitoring & Observability
description: Define monitoring strategy, metrics, alerts, and incident response
---

# Monitoring & Observability

## Key Metrics
### Performance Metrics
- Submission API latency and error rate.
- AI provider call latency/failure rate by provider name.
- File I/O and process resource usage (CPU/memory/disk) on host.

### Business Metrics
- Submission approval/rejection ratio.
- Confidence-based rejection ratio (`confidence < 100`).
- Not-submitted vs submitted counts from admin views.
- Reminder send success/failure counts.

### Error Metrics
- Auth failures (`401` on admin routes).
- Upload validation failures (size/type/magic-byte mismatch).
- Tracking file failures (read/write/upload/update).

## Monitoring Tools
- Current observability is log-driven:
  - server logs (`console.*`) for API/service failures,
  - PM2 process logs in production,
  - Nginx access/error logs in EC2 deployment.
- No dedicated APM/central log stack is configured yet.

## Logging Strategy
- Log key events for submission, AI provider fallback, and tracking updates.
- Log failures with actionable route/service context.
- Avoid logging sensitive secrets or full credential payloads.
- Keep retention/rotation managed by PM2/Nginx host-level policy.

## Alerts & Notifications
### Critical Alerts
- Admin auth route consistently failing → investigate JWT secret/cookie behavior.
- Submission endpoint persistent 5xx failures → investigate AI/storage/tracking dependencies.

### Warning Alerts
- Increased AI provider fallback frequency → check primary provider quota/availability.
- Repeated tracking.xlsx read/write errors → validate file integrity and path permissions.

## Dashboards
- Current dashboarding is in-app admin UI:
  - user list summary chips,
  - check-in table status matrix,
  - `/api/admin/summary` status aggregation.
- External infra dashboards are recommended but not yet defined.

## Incident Response
### On-Call Rotation
- Not formally documented in this repository.

### Incident Process
1. Detection and triage
   - Detect via user reports, admin UI anomalies, or server logs.
2. Investigation and diagnosis
   - Isolate to auth, submission validation, AI provider, tracking Excel, or storage layer.
3. Resolution and mitigation
   - Apply config/code fix, restart services if needed, restore corrupted files from backup.
4. Post-mortem and learning
   - Capture root cause and add regression checks.

## Health Checks
- Smoke-test endpoints:
  - `/api/auth/me` (session/auth),
  - `/api/mapping/types` (mapping load),
  - `/api/admin/summary` (admin protection + storage read).
- Validate AI dependency by controlled submission in staging/local.
- Validate storage paths and tracking file presence on startup/deploy.
