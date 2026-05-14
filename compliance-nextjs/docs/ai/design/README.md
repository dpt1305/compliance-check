---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---

# System Design & Architecture

## Architecture Overview
```mermaid
graph TD
  U[User Dashboard] -->|multipart submit| SUB[POST /api/submission]
  A[Admin UI] -->|JWT/cookie| ADMIN[/api/admin/**]
  SUB --> MV[Magic-byte + MIME validation]
  SUB --> MAP[Type mapping service]
  SUB --> AI[AI validation service]
  SUB --> IMG[Image storage local/S3]
  SUB --> JSON[(submissions.json)]
  SUB --> XLSX[(tracking.xlsx update)]
  LOGIN[/api/auth/login] --> ADM[(admins.json)]
  IMG --> IMGAPI[/api/images/[...path]]
  ADMIN --> XLSX
  ADMIN --> JSON
```

### Key components
- **Next.js App Router UI**: user dashboard + admin pages.
- **API routes**: auth, submission, admin operations, mapping, image serving.
- **Storage adapters**: JSON file storage, Excel read/write, local/S3 image abstraction.
- **AI validation layer**: provider config, ordered fallback, prompt selection by device type.

## Data Models
### Core entities
- **Submission** (`src/lib/storage/json-storage.ts`)
  - id, account, submissionType, status, image paths/URLs, submissionDate
  - validationResult/checklist, confidenceScore
  - extracted values: malwareAlerts, complianceCheck, seedConfiguration, operatingSystem, deviceSerial, deviceName
- **AdminUser** (`src/lib/storage/admin-storage.ts`)
  - id, username, bcrypt password, email, active
- **TrackingRow** (`src/lib/services/tracking-reader.ts`)
  - dynamic-column parsed row from `tracking.xlsx`, including account/email/serial/device + status columns

## API Design
### Public/user endpoints
- `POST /api/submission`
- `GET /api/mapping/types`
- `GET /api/mapping/types/[type]`
- `GET /api/images/[...path]`

### Auth endpoints
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Admin endpoints
- `GET/DELETE /api/admin/submissions`
- `GET/PUT/DELETE /api/admin/submissions/[id]`
- `GET/POST /api/admin/user-list`
- `GET /api/admin/checkin-table`
- `POST /api/admin/notify`
- `GET /api/admin/export`
- `GET/POST/PUT /api/admin/tracking`
- `GET /api/admin/summary`

### Auth model
- JWT signed with `JWT_SECRET`.
- Middleware protects `/api/admin/**` and `/admin/**` (except `/admin/login`).
- Token accepted via Bearer header and/or HttpOnly cookie (`admin_session`).

## Component Breakdown
### Frontend
- `DashboardForm`, `ValidationGuidance`, `ValidationResult`
- `UserList`, `CheckInTable`, `Notifications`
- `admin/layout.tsx` shell with nav/export/logout

### Backend services/modules
- `ai-validation.ts`, `excel-mapping.ts`, `tracking-reader.ts`, `excel-update.ts`, `excel-export.ts`, `notification.ts`
- `magic-bytes.ts`, `file-storage.ts`, `image-rename.ts`, `tracking-path.ts`
- `json-storage.ts`, `admin-storage.ts`, `jwt.ts`

### Third-party integrations
- AI endpoint compatible with `/v1/chat/completions` for Gemini/ChatGPT/NVIDIA-style providers
- AWS S3 via AWS SDK v3
- Teams webhook notification
- Excel handling via `exceljs`

## Design Decisions
- **Single Next.js app** for UI + API reduces deployment complexity.
- **File-based persistence** avoids DB ops overhead, at tradeoff of limited scale/concurrency controls.
- **Dynamic tracking column mapping** tolerates header variations in uploaded Excel files.
- **Provider fallback** improves AI service resilience.
- **Delayed image save until AI pass** avoids storing rejected evidence.
- **Strict confidence gate** requires AI confidence to be exactly `100` before approval/storage.

## Non-Functional Requirements
### Security
- Strict admin route protection via middleware.
- Upload hardening via extension + MIME + magic-byte validation.
- Path traversal checks in image endpoint and storage helpers.

### Reliability
- Graceful AI provider fallback; explicit failure response when all providers fail.
- Local fallback when S3 is not configured.

### Operational constraints
- Optimized for small/medium operational workloads.
- Current codebase does not yet implement system-wide request rate limiting or scheduled reminder jobs.
