# CURRENT_PLAN.md

> File ini adalah rencana terbaru berdasarkan progress terakhir.
> Diperbarui setiap selesai phase atau ada perubahan signifikan.
> Terakhir diperbarui: 2026-08-12

---

## Progress Summary

| Phase | Nama                      | Status | Subtasks |
| ----- | ------------------------- | ------ | -------- |
| 1     | PDF Generation            | ✅     | 5/5      |
| 2     | API Key Auth              | ✅     | 5/5      |
| 3     | Editor Improvements       | ✅     | 8/8      |
| 4     | Batch Generation          | ✅     | 5/5      |
| 5     | Webhooks                  | ✅     | 3/3      |
| 6     | MCP Server                | ✅     | 3/3      |
| 7     | Team Management           | ✅     | 7/7      |
| 8     | OAuth 2.0                 | ✅     | 4/4      |
| 9     | Document History + Usage  | ✅     | 3/3      |
| 10    | Rate Limiting + Audit Log | ⏳     | 0/3      |
| 11    | Polish                    | ⏳     | 0/4      |

**Total: 43/49 subtasks selesai (88%)**

---

## Phase 1: PDF Generation Engine ✅

| Subtask                                                           | Status |
| ----------------------------------------------------------------- | ------ |
| Install @react-pdf/renderer                                       | ✅     |
| Create documents table migration                                  | ✅     |
| Build PDF rendering service (`src/server/pdf-render.ts`)          | ✅     |
| Build sync generate server function (`src/functions/generate.ts`) | ✅     |
| Add generate button to editor UI                                  | ✅     |

**Notes:**

- Font pakai built-in (Helvetica, Courier) karena Google Fonts CDN bermasalah dengan react-pdf
- QR code & barcode masih placeholder text
- Rect shape positioning sudah di-fix (wrap Svg + absolutePos)

---

## Phase 2: API Key Auth ✅

| Subtask                                                                 | Status |
| ----------------------------------------------------------------------- | ------ |
| Create api_keys table migration                                         | ✅     |
| Build API key management server functions (`src/functions/api-keys.ts`) | ✅     |
| Create API auth middleware (`src/server/api-auth.ts`)                   | ✅     |
| Build developer portal UI (`src/routes/_authenticated.developers.tsx`)  | ✅     |
| Wire API auth to generate endpoint                                      | ✅     |

**Notes:**

- API key format: `rf_` + 48 random chars (crypto.getRandomValues)
- Hanya admin yang bisa buat API key (role check di server function)
- Scopes valid: `read`, `generate`

---

## Phase 3: Editor Improvements ✅

| Subtask                                                               | Status |
| --------------------------------------------------------------------- | ------ |
| Implement undo/redo state management (`use-editor-history.ts`)        | ✅     |
| Add undo/redo UI and keyboard shortcuts (`use-keyboard-shortcuts.ts`) | ✅     |
| Add conditional visibility UI                                         | ✅     |
| Add element rename and lock toggle                                    | ✅     |
| Add font family selector                                              | ✅     |
| Add image upload to storage                                           | ✅     |
| Build template version history                                        | ✅     |
| Add template search and filter                                        | ✅     |

---

## Phase 4: Batch Generation ✅

| Subtask                                                       | Status |
| ------------------------------------------------------------- | ------ |
| Create batches and batch_items tables migration               | ✅     |
| Build batch creation server function                          | ✅     |
| Build batch processing worker                                 | ✅     |
| Build batch status endpoint                                   | ✅     |
| Build batch UI page (`src/routes/_authenticated.batches.tsx`) | ✅     |

**Notes:**

- Batch processing synchronus (bisa timeout untuk batch > 20 items)
- Batch item data lookup sudah di-fix (index-based, bukan find)

---

## Phase 5: Webhooks ✅

| Subtask                                                      | Status |
| ------------------------------------------------------------ | ------ |
| Create webhooks table migration                              | ✅     |
| Build webhook server functions (`src/functions/webhooks.ts`) | ✅     |
| Build webhook management UI (di developer portal)            | ✅     |

**Notes:**

- HMAC-SHA256 signing dengan `whsec_` secret
- Retry 3x exponential backoff (1s → 4s → 16s)
- Auto-notify saat batch completion
- Webhook URL harus HTTPS (HTTP ditolak)

---

## Phase 6: MCP Server ✅

| Subtask                                            | Status |
| -------------------------------------------------- | ------ |
| Set up MCP server (`@modelcontextprotocol/sdk`)    | ✅     |
| Implement 4 MCP tools                              | ✅     |
| Build MCP developer guide page (`/developers/mcp`) | ✅     |

**Tools:**

1. `list_templates` — return available templates + variable schemas
2. `get_template_schema` — return JSON schema untuk 1 template
3. `generate_document` — sync generate, return document URL
4. `get_batch_status` — cek progress batch

---

## Phase 7: Team Management ✅

| Subtask                                              | Status |
| ---------------------------------------------------- | ------ |
| Create invitations table migration                   | ✅     |
| Build invitation server functions                    | ✅     |
| Build team management UI (invite, role edit, remove) | ✅     |
| Build workspace settings editing                     | ✅     |
| Build profile management (dengan crop/rotate)        | ✅     |
| Build accept invitation page (`/invite`)             | ✅     |
| Send invitation email (Resend)                       | ✅     |

**Notes:**

- Accept invitation pakai server function (bypass RLS)
- Email ownership verification mencegah unauthorized acceptance
- Crop/rotate profile photo pakai react-easy-crop

---

## Phase 8: OAuth 2.0 ✅

| Subtask                                    | Status |
| ------------------------------------------ | ------ |
| Client Credentials grant                   | ✅     |
| Token introspection/revocation endpoints   | ✅     |
| OAuth client management (server functions) | ✅     |
| Create oauth_clients + oauth_tokens tables | ✅     |

**Endpoints:**

- `POST /api/v1/oauth/token` — exchange credentials for access token
- `POST /api/v1/oauth/introspect` — validate token

**Notes:**

- Google OAuth sudah jalan untuk login (dari Supabase Auth)
- Client Credentials untuk server-to-server
- SHA-256 hashing untuk secrets dan tokens

---

## Phase 9: Document History + Usage ✅

| Subtask                              | Status |
| ------------------------------------ | ------ |
| Document history page (`/documents`) | ✅     |
| Usage & billing page (`/usage`)      | ✅     |
| Create usage_counters table          | ✅     |

**Notes:**

- Document History filters: status (completed/generating/failed), source (editor/api/batch), template, date range
- Source detection: editor (generated_by=NULL), api (generated_by≠profile), batch (exists in batch_items)
- Usage page menampilkan charts dan plan limits

---

## Phase 10: Rate Limiting + Audit Log ⏳

| Subtask                                                    | Status |
| ---------------------------------------------------------- | ------ |
| Rate limiting per workspace/plan                           | ⏳     |
| Audit log table + tracking                                 | ⏳     |
| Document history: record ALL attempts (completed + failed) | ⏳     |

---

## Phase 11: Polish ⏳

| Subtask                              | Status |
| ------------------------------------ | ------ |
| Responsive mobile (non-editor pages) | ⏳     |
| Route-level error boundaries         | ⏳     |
| Template export/import (JSON)        | ⏳     |
| QR code & barcode real rendering     | ⏳     |

---

## Known Issues

| Issue                                                                         | Severity  | Status       |
| ----------------------------------------------------------------------------- | --------- | ------------ |
| Document History: failed batch items tidak muncul (tidak ada document record) | 🟠 MEDIUM | ⏳ Perlu fix |
| Custom fonts belum di-register (pakai built-in)                               | 🟡 LOW    | ⏳ Deferred  |
| Batch processing synchronus (timeout risk)                                    | 🟡 LOW    | ⏳ Deferred  |

---

## Bug Fixes Log

| Date       | Issue                                  | Severity    | Status                       |
| ---------- | -------------------------------------- | ----------- | ---------------------------- |
| 2026-08-12 | Invitation acceptance blocked by RLS   | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-12 | Broken duplicate-member check          | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-12 | No email ownership verification        | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-12 | HTTP webhook URLs allowed              | 🟠 HIGH     | ✅ Fixed                     |
| 2026-08-11 | Documents RLS pakai `public` role      | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-11 | Batch data lookup salah                | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-11 | API key creation privilege escalation  | 🟠 HIGH     | ✅ Fixed                     |
| 2026-08-11 | Rect shape positioning                 | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-11 | Font not registered (Space Grotesk)    | 🔴 CRITICAL | ✅ Fixed (built-in fallback) |
| 2026-08-11 | `page.margin.left` undefined           | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-11 | RLS helper functions revoke            | 🔴 CRITICAL | ✅ Fixed                     |
| 2026-08-11 | Workspace onboarding not transitioning | 🟠 HIGH     | ✅ Fixed                     |
| 2026-08-11 | `doc_type` undefined crash             | 🟠 HIGH     | ✅ Fixed                     |

---

## Database Schema

| Table             | RLS | Rows | Notes                     |
| ----------------- | --- | ---- | ------------------------- |
| profiles          | ✅  | 1    | Auto-created on signup    |
| companies         | ✅  | 1    | Workspace/tenant          |
| company_members   | ✅  | 1    | Role-based membership     |
| templates         | ✅  | 2    | Document templates        |
| template_versions | ✅  | 4    | Versioned layouts         |
| documents         | ✅  | 12   | Generated PDFs            |
| api_keys          | ✅  | 1    | SHA-256 hashed            |
| batches           | ✅  | 7    | Async generation jobs     |
| batch_items       | ✅  | 32   | Individual document jobs  |
| webhooks          | ✅  | 1    | HMAC-signed notifications |
| invitations       | ✅  | 1    | Team invitations          |
| oauth_clients     | ✅  | 0    | OAuth client credentials  |
| oauth_tokens      | ✅  | 0    | OAuth access tokens       |
| usage_counters    | ✅  | 0    | Usage tracking            |

---

## Key Files

| File                                       | Purpose                       |
| ------------------------------------------ | ----------------------------- |
| `src/server/pdf-render.ts`                 | PDF rendering engine          |
| `src/functions/generate.ts`                | Sync PDF generation           |
| `src/functions/batches.ts`                 | Batch processing              |
| `src/functions/webhooks.ts`                | Webhook delivery              |
| `src/functions/api-keys.ts`                | API key management            |
| `src/functions/team.ts`                    | Team management               |
| `src/functions/oauth.ts`                   | OAuth 2.0                     |
| `src/functions/accept-invite.ts`           | Invitation acceptance         |
| `src/server/api-auth.ts`                   | API authentication middleware |
| `src/server/email.ts`                      | Email service (Resend)        |
| `src/server/mcp-server.ts`                 | MCP server                    |
| `src/routes/api.v1.*.ts`                   | REST API endpoints            |
| `src/routes/_authenticated.developers.tsx` | Developer portal              |
| `src/routes/_authenticated.batches.tsx`    | Batch management UI           |
| `src/routes/_authenticated.documents.tsx`  | Document history              |
| `src/routes/_authenticated.usage.tsx`      | Usage tracking                |
| `src/routes/_authenticated.settings.tsx`   | Team & workspace settings     |
| `src/routes/invite.tsx`                    | Accept invitation             |

---

## How to Update This File

Setelah menyelesaikan phase atau fix bug penting:

1. Update status di tabel progress
2. Update subtask status di phase yang sesuai
3. Tambah entry di Bug Fixes Log
4. Update Database Schema jika ada table baru
5. Update Known Issues
6. Update Last Updated date di atas
