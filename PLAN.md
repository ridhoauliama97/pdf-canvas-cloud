# Report Flow — Development Plan

Sisa fitur yang belum dibangun, diurutkan berdasarkan dependency dan prioritas.

---

## Phase 1: PDF Generation Engine (Core Value)

> Tanpa ini, product belum bisa deliver value utama.

### 1.1 PDF Rendering Service

- Install engine: `@react-pdf/renderer` atau `@react-pdf/node` (server-side)
- Buat `src/server/pdf-render.ts` — terima template layout + data JSON, return PDF buffer
- Handle: text wrapping, table pagination (reuse `layout-paginate.ts`), image embedding, QR/barcode rendering
- Format output: A4/Letter sesuai `page.format`

### 1.2 Sync Generate Endpoint

- Buat TanStack Start server function: `src/routes/api/v1/documents/generate.function.ts`
- POST: `{ template_id, data }` → return PDF binary atau signed URL
- Validasi: template harus `published`, user harus punya akses ke template
- Simpan record ke tabel `documents` (belum ada — perlu migration baru)

### 1.3 New Migration: `documents` table

```sql
documents (
  id uuid PK,
  company_id uuid FK → companies,
  template_id uuid FK → templates,
  version_id uuid FK → template_versions,
  status text, -- 'generating' | 'completed' | 'failed'
  file_url text,
  data_snapshot jsonb,
  generated_by uuid, -- user_id atau api_key_id
  created_at timestamptz
)
```

### 1.4 Storage Integration

- Upload generated PDF ke `reportflow-bucket/{company_id}/documents/{id}.pdf`
- Generate signed URL untuk download (expire 1 jam)

---

## Phase 2: API Key Auth

> Diperlukan sebelum REST API bisa dipakai external developer.

### 2.1 New Migration: `api_keys` table

```sql
api_keys (
  id uuid PK,
  company_id uuid FK → companies,
  name text,
  key_hash text NOT NULL, -- hashed, tidak pernah ditampilkan lagi
  key_prefix text, -- 'rf_' + 8 char pertama (untuk identifikasi)
  scopes text[] DEFAULT '{read,generate}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
```

### 2.2 API Key Middleware

- `src/server/api-auth.ts` — validate `Authorization: Bearer rf_...` header
- Hash input, lookup di `api_keys`, attach `company_id` + `scopes` ke context
- Rate limiting per key (bisa pakai Supabase atau in-memory)

### 2.3 Developer Portal UI

- Route: `/developers` atau `/settings/developers`
- Create API key (generate sekali, tampilkan sekali, lalu hash)
- List keys, revoke key
- Tampilkan prefix saja, bukan full key

---

## Phase 3: Template Editor Improvements

> Menyempurnakan editor sebelum fitur batch dan MCP.

### 3.1 Undo/Redo

- State history stack di editor (max 50 steps)
- Keyboard shortcut: Ctrl+Z / Ctrl+Shift+Z
- Undo/redo buttons di toolbar

### 3.2 Conditional Visibility UI

- Tipe `Condition` sudah ada di `types/template.ts`
- Tambah panel "Visibility" di property inspector
- Config: path, operator (truthy/falsy/eq/neq/gt/lt), value

### 3.3 Element Rename + Lock

- Input rename di inspector (field `name` sudah ada di type)
- Toggle lock/unlock (field `locked` sudah ada di type)

### 3.4 Image Upload

- Upload ke `reportflow-bucket/{company_id}/images/`
- Ganti input URL dengan upload component + URL fallback

### 3.5 Font Family Selector

- `ElementStyle.fontFamily` sudah ada di type
- Tambah dropdown: Inter, Space Grotesk, JetBrains Mono (font yang sudah di-load)

### 3.6 Table Column Editing Lengkap

- Column width, alignment, format — semua sudah ada di type tapi belumExposed di inspector

### 3.7 Keyboard Shortcuts

- Delete key untuk hapus element
- Arrow key nudge (1px, Shift+arrow 10px)
- Escape untuk deselect

### 3.8 Template Version History

- Route baru atau tab di editor
- List semua versi, timestamp, perubahan
- Rollback button (set `current_version_id` ke versi lama)

### 3.9 Template Search/Filter

- Search by name di template list
- Filter by status (draft/published) dan doc_type

---

## Phase 4: Async Batch Generation

> Untuk use case high-volume (ribuan dokumen).

### 4.1 New Migration: `batches` + `batch_items`

```sql
batches (
  id uuid PK,
  company_id uuid FK → companies,
  status text DEFAULT 'queued', -- queued | processing | completed | completed_with_errors | failed
  total_count int,
  processed_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  created_by uuid,
  created_at timestamptz
)

batch_items (
  id uuid PK,
  batch_id uuid FK → batches,
  template_id uuid FK → templates,
  data jsonb,
  document_id uuid FK → documents,
  status text DEFAULT 'queued', -- queued | processing | completed | failed
  error text,
  created_at timestamptz
)
```

### 4.2 Batch Endpoint

- POST `/api/v1/documents/batch` → `{ template_id, items: [{data}] }` → return `batch_id`
- TanStack server function, insert batch + batch_items, mulai processing

### 4.3 Worker / Processing

- Opsi A: Server function langsung proses (simple, tapi blocking)
- Opsi B: Supabase Edge Function sebagai worker (scalable, butuh setup)
- Rekomendasi: Opsi A dulu, migrate ke B kalau butuh scale

### 4.4 Batch Status Endpoint

- GET `/api/v1/batches/{batch_id}` → status, progress, per-item results

---

## Phase 5: Webhooks

> Notifikasi async untuk batch completion.

### 5.1 New Migration: `webhooks` table

```sql
webhooks (
  id uuid PK,
  company_id uuid FK → companies,
  url text NOT NULL,
  secret text NOT NULL, -- untuk HMAC signing
  events text[] DEFAULT '{batch.completed}',
  active boolean DEFAULT true,
  created_at timestamptz
)
```

### 5.2 Webhook Delivery

- Setelah batch selesai, kirim POST ke registered URLs
- HMAC-SHA256 signature di header `X-Webhook-Signature`
- Retry 3x dengan exponential backoff

### 5.3 Developer Portal: Webhook Management

- CRUD webhook URLs
- Test webhook button
- Recent delivery log

---

## Phase 6: MCP Server

> Supaya AI agent bisa generate dokumen langsung.

### 6.1 MCP Server Setup

- Install `@modelcontextprotocol/sdk`
- Buat `src/server/mcp.ts` — MCP server entry point

### 6.2 MCP Tools

- `list_templates` → return templates + variable schemas
- `get_template_schema` → return JSON schema untuk 1 template
- `generate_document` → sync generate, return document URL
- `get_batch_status` → cek progress batch

### 6.3 MCP Auth

- Reuse API key auth (header `Authorization: Bearer rf_...`)
- Validasi key punya scope `generate` untuk generate_document

### 6.4 Developer Portal: MCP Guide

- Route: `/developers/mcp`
- Connection string, example tool-call payloads
- Test connection button

---

## Phase 7: Team Management

### 7.1 Member Invitation

- Generate invitation token, kirim email (via Supabase Edge Function atau Resend)
- Accept invite: `/auth/invite?token=xxx` → insert ke `company_members`
- Status: pending / accepted / expired

### 7.2 Role Management

- Admin bisa edit role member
- Admin bisa remove member (kecuali diri sendiri)

### 7.3 Workspace Settings Editing

- Update name, industry, brand color, logo
- Logo upload ke storage bucket

### 7.4 Profile Management

- Edit nama, avatar
- Route: `/settings/profile`

---

## Phase 8: Polish & DX

### 8.1 Template Export/Import

- Export template sebagai JSON file
- Import template dari JSON

### 8.2 Document History Page

- List generated documents
- Filter by template, status, date
- Download link

### 8.3 Usage & Billing (opsional, bisa later)

- Track documents generated per month
- Display usage charts
- Plan limits enforcement

### 8.4 Responsive Mobile

- Template list bisa diakses di mobile
- Settings bisa diakses di mobile
- Editor tetap desktop-only

### 8.5 Error Boundaries

- Route-level error boundaries untuk authenticated area
- Better error messages

---

## Dependency Graph

```
Phase 1 (PDF Engine)
  └─→ Phase 2 (API Keys) — bisa paralel
        └─→ Phase 4 (Batch) — butuh sync generate dulu
              └─→ Phase 5 (Webhooks) — butuh batch
Phase 3 (Editor) — bisa paralel dengan 1-2
Phase 6 (MCP) — butuh Phase 1 + 2
Phase 7 (Team) — independent, bisa mulai kapan saja
Phase 8 (Polish) — terakhir
```

## Estimasi

| Phase     | Komponen Utama             | Estimasi       |
| --------- | -------------------------- | -------------- |
| 1         | PDF engine + sync endpoint | 3-5 hari       |
| 2         | API keys + middleware + UI | 2-3 hari       |
| 3         | Editor improvements        | 4-6 hari       |
| 4         | Batch generation           | 2-3 hari       |
| 5         | Webhooks                   | 1-2 hari       |
| 6         | MCP server                 | 2-3 hari       |
| 7         | Team management            | 2-3 hari       |
| 8         | Polish                     | 3-5 hari       |
| **Total** |                            | **19-30 hari** |
