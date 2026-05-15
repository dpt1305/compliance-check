# CLAUDE.md — Web Compliance Check System

## Admin Credentials (Default)

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `Admin@123` |
| Email | `admin@compliance.local` |
| Login URL | `http://localhost:4200/admin/login` |

> Default credentials are automatically seeded in `./data/admins.json` on first startup.
> Password is BCrypt-hashed using `DataInitializationRunner` at application startup.
> **Change this password after first login in production.**

---

## Project Overview

A full-stack compliance management system with:
- **Backend**: Spring Boot (`/compliance` folder)
- **Frontend**: Angular (`/compliance-dashboard` folder)
- **Purpose**: Track user compliance submissions (documents/images), validate them via AI, manage deadlines, and export reports.

---

## Architecture Summary

```
compliance/                    <- Spring Boot backend
compliance-dashboard/          <- Angular frontend
```

### Core Modules

| Module | Description |
|---|---|
| User Dashboard | Form input with image upload, type selection, laptop field |
| Image Validation | AI-powered (Gemini / ChatGPT / NVIDIA with priority ordering) + type matching |
| Admin Site | Auth, user list management, deadline notifications, check-in table, Excel export |
| Security | DDOS protection (optional), frontend + backend validation, IP checking |
| File Mapping | Excel file for item-to-type mapping reference |

---

## Backend — Spring Boot (`/compliance`)

### Stack
- Java 17+, Spring Boot 3.x
- Spring Security (JWT-based admin authentication)
- JSON file storage (Jackson ObjectMapper) for submissions and admin credentials
- Apache POI (Excel read/write)
- RestTemplate or WebClient (for AI API calls)
- Bucket4j or similar (optional: rate limiting / DDOS protection)

### Folder Structure

```
src/main/java/vibe/code/compliance/
├── config/
│   ├── SecurityConfig.java               # JWT, CORS, IP whitelist
│   ├── WebMvcConfig.java                 # Static resource mapping for /images/**
│   ├── RateLimitConfig.java              # Optional DDOS/rate limiting
│   ├── DataInitializationRunner.java     # Seeds default admin on startup
│   └── AiProviderConfig.java             # Gemini/ChatGPT/NVIDIA config
├── controller/
│   ├── SubmissionController.java         # POST /api/submission (user form)
│   ├── AdminController.java              # Admin CRUD, export, notifications
│   ├── AuthController.java               # Admin login/logout
│   └── GlobalExceptionHandler.java       # Centralized error handling
├── service/
│   ├── SubmissionService.java            # Business logic for form + image
│   ├── ImageValidationService.java       # AI validation + type matching
│   ├── JsonStorageService.java           # Submissions JSON persistence
│   ├── AdminJsonStorageService.java      # Admin credentials JSON persistence
│   ├── AdminUserDetailsService.java      # Spring Security UserDetailsService
│   ├── AdminService.java                 # Admin business logic
│   ├── ExcelMappingService.java          # Read Excel mapping file
│   ├── ExcelExportService.java           # Export submissions to Excel
│   ├── NotificationService.java          # Teams webhook notifications
│   └── DeadlineSchedulerService.java     # Deadline reminder scheduler
├── model/
│   ├── Submission.java                   # Submission entity (JSON)
│   └── Admin.java                        # Admin entity (JSON)
├── dto/
│   ├── SubmissionRequestDTO.java
│   ├── SubmissionResponseDTO.java
│   ├── AdminUserDTO.java
│   ├── LoginRequestDTO.java
│   ├── CheckInTableDTO.java
│   └── AiValidationResult.java
├── security/
│   ├── JwtTokenProvider.java             # JWT token generation/validation
│   ├── JwtAuthenticationFilter.java      # JWT auth filter
│   └── IpValidationFilter.java           # IP whitelist filter
└── util/
    ├── MagicBytesValidator.java          # Image magic byte validation
    ├── ImageRenameUtil.java              # Rename image before save
    └── FileStorageUtil.java              # Save to independent storage path
```

### JSON Storage (No Database Required)

The system uses JSON file-based persistence instead of a database:

**Storage Paths** (configurable via `application.properties`):
```properties
storage.json.path=./data/submissions.json                 # All user submissions
storage.json.admin.path=./data/admins.json               # Admin credentials
storage.image.path=./data/images                          # Image file storage
```

**Initialization**:
- `DataInitializationRunner` executes on application startup
- Automatically creates `./data/admins.json` if it doesn't exist
- Seeds default admin user: `admin` / `Admin@123` (BCrypt-hashed)
- Can be safely re-run (skips if admin already exists)

**Services**:
- `JsonStorageService` — CRUD operations for submissions (thread-safe with file locking)
- `AdminJsonStorageService` — CRUD operations for admin credentials (thread-safe)

### Key API Endpoints

```
POST   /api/submission              # Submit form with image
GET    /api/admin/submissions        # List all submissions (admin)
PUT    /api/admin/submissions/{id}   # Edit user record
GET    /api/admin/export             # Download Excel report
POST   /api/admin/notify             # Trigger deadline notification
POST   /api/auth/login               # Admin login
POST   /api/auth/logout
GET    /api/admin/checkin-table      # Check-in overview
```

### Image Handling

1. **Receive** multipart image from frontend
2. **Validate MIME type** against Content-Type header AND magic bytes (do not trust extension alone)
3. **Cross-check** image type against the user's declared submission type (via Excel mapping)
4. **Rename** the image before saving:
   ```
   {userId}_{submissionType}_{timestamp}_{randomUUID}.{ext}
   Example: usr123_laptop_20240315_a1b2c3.jpg
   ```
5. **Save** to independent image storage path (configurable via `application.properties`):
   ```properties
   storage.image.path=./data/images
   storage.image.base-url=http://localhost:8081/images/
   ```
   Images are served by Spring Boot static resource handler (`WebMvcConfig.java`)
6. **Send** image (as base64 or URL) to AI validation service
7. **Return** full validation result to frontend

### AI Validation Service

Supports multiple AI providers (Gemini, ChatGPT, NVIDIA) with configurable priority ordering via `order` property. Providers are tried in order until one succeeds; if all fail or are unavailable, the service falls back gracefully.

**Provider Configuration** (in `application.properties`):
```properties
# Enable/disable providers (default: true for Gemini & ChatGPT, false for NVIDIA)
ai.gemini.enabled=${AI_GEMINI_ENABLED:true}
ai.chatgpt.enabled=${AI_CHATGPT_ENABLED:true}
ai.nvidia.enabled=${AI_NVIDIA_ENABLED:false}

# Order property: lower number = higher priority (tried first)
ai.gemini.order=${AI_GEMINI_ORDER:0}
ai.chatgpt.order=${AI_CHATGPT_ORDER:1}
ai.nvidia.order=${AI_NVIDIA_ORDER:2}

# API credentials and endpoints (Bearer token auth for all providers)
# Note: /v1/chat/completions is automatically appended to the endpoint base URL
ai.gemini.api-key=${GEMINI_API_KEY:}
ai.gemini.endpoint=${AI_GEMINI_ENDPOINT:https://aiportalapi.stu-platform.live/jpe}
ai.gemini.model=${AI_GEMINI_MODEL:Gemini-3.1-Flash-Lite}

ai.chatgpt.api-key=${CHATGPT_API_KEY:}
ai.chatgpt.endpoint=${AI_CHATGPT_ENDPOINT:https://aiportalapi.stu-platform.live/use}
ai.chatgpt.model=${CHATGPT_MODEL:gpt-5-mini}

ai.nvidia.api-key=${NVIDIA_API_KEY:}
ai.nvidia.endpoint=${AI_NVIDIA_ENDPOINT:}
ai.nvidia.model=${AI_NVIDIA_MODEL:}
```

**Configuration Examples**:

*Example 1: Gemini first, then ChatGPT (default)*
```properties
ai.gemini.order=0
ai.chatgpt.order=1
ai.nvidia.enabled=false
```

*Example 2: ChatGPT first, then Gemini, then NVIDIA*
```properties
ai.chatgpt.order=0
ai.gemini.order=1
ai.nvidia.order=2
ai.nvidia.enabled=true
ai.nvidia.endpoint=https://integrate.api.nvidia.com/v1/chat/completions
ai.nvidia.model=moonshotai/kimi-k2.5
```

*Example 3: Disable all but ChatGPT*
```properties
ai.gemini.enabled=false
ai.nvidia.enabled=false
ai.chatgpt.order=0
```

**Prompt strategy (system prompt for AI)**:
```
You are a compliance image validator.
Given an image and an expected type (e.g. "laptop"), determine:
1. Does the image clearly show a {expectedType}?
2. Is the image clear, unobstructed, and complete?
3. Confidence score (0-100)

Respond in JSON:
{
  "valid": true|false,
  "matchesType": true|false,
  "confidence": 0-100,
  "reason": "short explanation",
  "suggestion": "optional improvement tip"
}
```

**Success guide** (returned to frontend when `valid: true && matchesType: true`):
- Image detected as: `{detectedType}`
- Matches required type: `{submissionType}`
- Confidence: `{confidence}%`
- Message: "Your submission has been accepted."

### Excel Mapping File

- Location: `src/main/resources/mapping/type-mapping.xlsx` (or configurable path)
- Columns: `submissionType | allowedImageTypes | description | exampleKeywords`
- Loaded at startup via `ExcelMappingService`, cached in memory
- Used during image validation to verify type compatibility

### Security

```java
// SecurityConfig.java — key concerns:

// 1. IP Validation (trusted backend-only endpoints)
//    - Maintain whitelist of trusted IPs/CIDRs
//    - Apply to /api/admin/** routes

// 2. CORS
//    - Allow only compliance-dashboard origin(s)

// 3. JWT (admin auth)
//    - Stateless, signed, short-lived (1h access + refresh token)

// 4. Rate Limiting (optional DDOS protection)
//    - Bucket4j: e.g. 20 req/min per IP on /api/submission
//    - Return 429 Too Many Requests with Retry-After header

// 5. Input validation
//    - @Valid on all DTOs
//    - File size limit (e.g. max 10MB)
//    - Allowed MIME types whitelist
```

### Notification Service

Support both modes:

```java
// Mode 1: Direct notification (email / push)
// Mode 2: Microsoft Teams webhook (hook)

// application.properties
notification.mode=teams         # or: direct
notification.teams.webhook-url=${TEAMS_WEBHOOK_URL}
notification.email.smtp=...     # if direct mode

// Trigger: scheduled job (cron) checks deadlines
@Scheduled(cron = "0 9 * * * MON-FRI")   // every weekday at 9am
public void checkDeadlines() { ... }
```

---

## Frontend — Angular (`/compliance-dashboard`)

### Stack
- Angular 17+ (standalone components preferred)
- Angular Material or PrimeNG for UI
- ReactiveFormsModule for form validation
- HttpClient with interceptors
- ngx-file-drop or native file input for image upload

### Folder Structure

```
src/app/
├── core/
│   ├── interceptors/
│   │   ├── auth.interceptor.ts        # Attach JWT to admin requests
│   │   └── error.interceptor.ts
│   ├── guards/
│   │   └── admin.guard.ts
│   └── services/
│       ├── submission.service.ts
│       ├── admin.service.ts
│       └── auth.service.ts
├── shared/
│   ├── components/
│   │   ├── image-upload/              # Reusable image upload component
│   │   └── validation-result/        # Success/failure guide display
│   └── validators/
│       └── image-type.validator.ts   # Frontend image type validator
├── features/
│   ├── dashboard/                    # User submission form
│   │   ├── dashboard.component.ts
│   │   ├── dashboard.component.html
│   │   └── dashboard.component.scss
│   └── admin/
│       ├── login/
│       ├── user-list/
│       ├── checkin-table/
│       └── notifications/
└── app.routes.ts
```

### User Dashboard Form

**Fields:**
- `account` — text input (required)
- `image` — file upload (required, validated)
- `type` — dropdown/select (e.g. Laptop, Monitor, Phone — loaded from Excel mapping via API)

**Frontend Validation (before API call):**
```typescript
// image-type.validator.ts
// 1. Check file extension: .jpg, .jpeg, .png, .webp only
// 2. Check MIME type via FileReader (read first 4 bytes for magic number):
//    FF D8 FF       -> JPEG
//    89 50 4E 47    -> PNG
//    52 49 46 46    -> WEBP
// 3. Check file size <= 10MB
// 4. Cross-reference selected `type` with allowed image types
//    (load mapping from /api/mapping or embed at build time)
// 5. Show inline error messages for each failure case
```

**Validation Success Guide (displayed after AI approval):**
```html
<!-- validation-result.component.html -->
<!-- Shown when backend returns valid: true -->
<div class="success-guide">
  <div class="step">Image received and type verified</div>
  <div class="step">AI validation passed ({{ confidence }}% confidence)</div>
  <div class="step">Matches submission type: {{ submissionType }}</div>
  <div class="step">Submission saved successfully</div>
  <p class="suggestion" *ngIf="suggestion">Tip: {{ suggestion }}</p>
</div>
```

**Image Rename (frontend preview only — actual rename is backend):**
- Show renamed filename preview to user before upload
- Format: `{account}_{type}_{date}.{ext}`

### Admin Site

#### Authentication
- Login page at `/admin/login`
- JWT stored in `httpOnly` cookie (preferred) or `sessionStorage`
- Route guard on all `/admin/**` routes
- Auto-logout on token expiry

#### User List
- Table with: `ID | Project | Name | Account | Type | Status | Submission Date | Image Preview | Actions`
- Inline edit (click cell -> editable input -> save)
- **Project filter**: searchable multi-select dropdown (Select All / individual projects with checkboxes) — filters rows by `project` field from tracking.xlsx; empty selection = show all
- Tag-based search (AND logic), month/year period filter

#### Check-in Table
- Grid view of all users vs. compliance items
- Color-coded: Complete / Pending / Missing
- **Project filter**: searchable multi-select dropdown (Select All / individual projects with checkboxes) — filters accounts shown in the grid by project; empty selection = show all
- Filter by: status, date range
- `project` field is joined from tracking.xlsx by account at API level

#### Notifications
- "Send Reminder" button -> calls `POST /api/admin/notify`
- Shows last notification timestamp
- Configure deadline date + notification message

#### Export to Excel
- Button calls `GET /api/admin/export`
- Downloads `.xlsx` file via blob response:
```typescript
this.adminService.exportExcel().subscribe(blob => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compliance-report-${Date.now()}.xlsx`;
  a.click();
});
```

### Security (Frontend)

```typescript
// auth.interceptor.ts
// 1. Attach Bearer token to all /api/admin/* requests
// 2. On 401 -> redirect to /admin/login
// 3. On 429 -> show "Too many requests, please wait" toast
// 4. On 403 -> show "Access denied" with IP info if available

// Additional:
// - Sanitize all user inputs (Angular's DomSanitizer for any HTML)
// - Never store sensitive data in localStorage
// - CSP headers enforced via backend
```

---

## Validation Flow (End-to-End)

```
User fills form
  -> [Frontend] Validate: file type, magic bytes, size, type match
  -> [Frontend] Preview renamed filename
  -> POST /api/submission (multipart: account, type, image)
  -> [Backend] Re-validate: MIME, magic bytes, size (never trust frontend)
  -> [Backend] Check IP (is request from trusted origin?)
  -> [Backend] Rename image: {userId}_{type}_{timestamp}_{uuid}.{ext}
  -> [Backend] Save image to independent storage
  -> [Backend] Load Excel mapping -> verify type compatibility
  -> [Backend] Call AI API with image + expected type (tries providers in order: Gemini → ChatGPT → NVIDIA, stops at first success)
  -> [Backend] Parse AI response (valid, matchesType, confidence, reason)
  -> [Backend] Save submission record to DB
  -> [Frontend] Display full success guide OR specific error with reason
```

---

## Environment Variables

```bash
# Backend (.env or application.properties)

# Database (COMMENTED OUT - Using JSON file storage instead)
# DB_URL=jdbc:sqlserver://localhost;databaseName=compliance;encrypt=false;trustServerCertificate=true
# DB_USERNAME=...
# DB_PASSWORD=...

# AI Provider Configuration (multiple providers with priority ordering)
# Enable/disable providers
AI_GEMINI_ENABLED=true
AI_CHATGPT_ENABLED=true
AI_NVIDIA_ENABLED=false

# Provider execution order (0=highest priority, tried first)
AI_GEMINI_ORDER=0
AI_CHATGPT_ORDER=1
AI_NVIDIA_ORDER=2

# Gemini configuration (uses Bearer token authentication)
# Full endpoint: {AI_GEMINI_ENDPOINT}/v1/chat/completions
GEMINI_API_KEY=...
AI_GEMINI_ENDPOINT=https://aiportalapi.stu-platform.live/jpe
AI_GEMINI_MODEL=Gemini-3.1-Flash-Lite

# ChatGPT configuration (uses Bearer token authentication)
# Full endpoint: {AI_CHATGPT_ENDPOINT}/v1/chat/completions
CHATGPT_API_KEY=...
AI_CHATGPT_ENDPOINT=https://aiportalapi.stu-platform.live/use
CHATGPT_MODEL=gpt-5-mini

# NVIDIA configuration (for fallback when Gemini/ChatGPT unavailable)
NVIDIA_API_KEY=...
AI_NVIDIA_ENDPOINT=https://integrate.api.nvidia.com/v1/chat/completions
AI_NVIDIA_MODEL=moonshotai/kimi-k2.5

# File Storage
STORAGE_IMAGE_PATH=./data/images
STORAGE_IMAGE_BASE_URL=http://localhost:8081/images/
STORAGE_JSON_PATH=./data/submissions.json
STORAGE_JSON_ADMIN_PATH=./data/admins.json

# Notifications
NOTIFICATION_MODE=teams
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...
DEADLINE_DATE=2026-12-31
REMINDER_DAYS_BEFORE=7
NOTIFICATION_MESSAGE=Please submit your compliance documents before the deadline.

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_RPM=20

# Security
TRUSTED_IPS=127.0.0.1,10.0.0.0/8
CORS_ALLOWED_ORIGINS=http://localhost:4200

# JWT
JWT_SECRET=changeme-replace-in-production-must-be-256-bits-long!!
JWT_EXPIRY_HOURS=1

# Server
SERVER_PORT=8081

# Excel Mapping
EXCEL_MAPPING_PATH=classpath:mapping/type-mapping.xlsx
```

---

## Excel Mapping File Format

`type-mapping.xlsx`:

| submissionType | allowedImageTypes   | description                  | exampleKeywords                      |
|----------------|---------------------|------------------------------|--------------------------------------|
| laptop         | jpg,jpeg,png,webp   | Laptop or notebook computer  | laptop, notebook, macbook, thinkpad  |
| monitor        | jpg,jpeg,png        | Desktop monitor or display   | monitor, display, screen             |
| phone          | jpg,jpeg,png,webp   | Mobile phone                 | phone, smartphone, iphone, android   |

---

## Naming Conventions

| Context | Convention |
|---|---|
| Java classes | PascalCase |
| Java methods/fields | camelCase |
| Angular components | kebab-case folders, PascalCase class |
| Database tables | snake_case |
| Image saved filename | `{userId}_{type}_{yyyyMMdd}_{uuid8}.{ext}` |
| API routes | `/api/kebab-case` |
| Excel export filename | `compliance-report-{yyyyMMdd-HHmm}.xlsx` |

---

## Implementation Checklist

### Backend
- [x] Spring Security config (JWT + IP filter + CORS)
- [x] Rate limiter (Bucket4j) — optional, toggle via property
- [x] Multipart file endpoint with dual validation (MIME + magic bytes)
- [x] Image rename utility
- [x] Independent file storage service
- [x] Excel mapping loader (startup, cached)
- [x] AI validation service (Gemini + ChatGPT + NVIDIA, ordered priority with automatic fallback)
- [x] Submission entity + repository + service
- [x] Admin CRUD endpoints
- [x] Deadline check scheduler
- [x] Teams webhook notification service
- [x] Excel export (Apache POI)
- [x] Full error response DTOs with validation reasons

### Frontend
- [x] Reactive form with all three fields (account, image, type)
- [x] Magic byte image validator
- [x] Filename preview (renamed format)
- [x] Validation success guide component
- [x] Admin login + route guard
- [x] User list with inline edit
- [x] Check-in table with color status
- [x] Notification trigger button
- [x] Excel export download
- [x] HTTP interceptors (auth + error + rate limit)

---

## Notes for Claude

When generating code for this project:

1. **Backend path** = `compliance/` (Spring Boot, Java 17+, Maven)
2. **Frontend path** = `compliance-dashboard/` (Angular 17+, TypeScript)
3. **File storage** uses `./data/` directory (development): `./data/submissions.json`, `./data/admins.json`, `./data/images/`, `./data/tracking.xlsx`
4. **Image serving** — Spring Boot serves images via `WebMvcConfig.java` static resource handler at `/images/**` → maps to `./data/images/`
5. Always validate images on **both** frontend AND backend — never trust one side alone
6. Image storage is **independent** (not in DB, not in project folder) — use configurable path
7. AI providers (Gemini, ChatGPT, NVIDIA) use **ordered priority** via `ai.{provider}.order` property — lower number = higher priority, with automatic fallback
8. Excel mapping file is the **source of truth** for type-to-image-type mapping
9. Admin site requires **authentication** — never expose admin endpoints without JWT guard
10. Notifications support **two modes**: direct (email/push) and Teams webhook — switchable
11. DDOS protection is **optional** but must be toggle-able without code change
12. All validation errors must return **descriptive messages** (not just HTTP status codes)
13. Image rename happens on the **backend only** — frontend shows a preview only
14. The AI prompt must include **both the image and the expected type** for cross-validation
