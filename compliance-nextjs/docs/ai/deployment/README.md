---
phase: deployment
title: Deployment Strategy
description: Define deployment process, infrastructure, and release procedures
---

# Deployment Strategy

## Infrastructure
- Primary documented target: **AWS EC2 (Ubuntu)** running Next.js with PM2 + Nginx.
- Optional S3 bucket for image storage; local file storage fallback when S3 not configured.
- Persistent operational data paths:
  - `submissions.json`
  - `admins.json`
  - `tracking.xlsx`
  - image objects/files

## Deployment Pipeline
### Build Process
- `npm ci`
- `npm run build`
- `npm run start` (via PM2 in production)
- Build uses standalone output copy behavior from `package.json`.

### CI/CD Pipeline
- No formal CI/CD definition captured in this repository yet.
- Current process is manual deployment using the EC2 guide (`EC2-DEPLOY.md`).

## Environment Configuration
### Development
- Use `.env.local` (from `.env.local.example`).
- Typical image storage: local `./data/images` (or S3 if configured).

### Staging
- Not explicitly defined in current repository docs.

### Production
- Use `.env.production` (from `.env.production.example`).
- Set secure `JWT_SECRET` and API keys.
- For EC2 + IAM role: do not hardcode AWS keys in production env.
- Serve app behind Nginx with HTTPS termination.

## Deployment Steps
1. Pre-deployment checklist
   - Verify env values (`JWT_SECRET`, AI keys, storage paths, notification mode/webhook).
   - Confirm business rule alignment: submissions are approved only when AI confidence is `100%`.
   - Ensure `tracking.xlsx` and data directory strategy are in place.
2. Deployment execution steps
   - Pull code, run `npm ci`, build, restart PM2 process.
   - Reload Nginx after config/cert updates.
3. Post-deployment validation
   - Verify admin login, submission flow, and export endpoint.
4. Rollback procedure (if needed)
   - Revert deployment to previous release directory/commit and restart PM2.

## Database Migrations
- Not applicable for relational DB (project uses JSON/Excel persistence).
- Treat JSON/Excel schema changes as file-format migrations with backup-first policy.

## Secrets Management
- Keep secrets in environment variables; never commit them.
- Rotate JWT secret and AI keys as part of operational security maintenance.
- Replace default admin password immediately after first production login.

## Rollback Plan
- Trigger rollback on broken auth, submission failures, or critical admin workflow regression.
- Restore previous app build and previous `data/` backup if data file corruption occurs.
- Re-validate `/api/submission`, `/api/auth/login`, `/api/admin/user-list`, `/api/admin/export`.
