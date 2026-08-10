Report Flow

Product Overview

Build Report Flow, a SaaS platform that lets businesses turn recurring business documents (invoices, quotations, purchase orders, receipts, delivery notes, contracts) into reusable templates using a visual drag-and-drop editor, then generate final PDFs on demand by calling a REST API or an MCP server. The platform must support both single synchronous PDF generation (instant response) and large asynchronous batch generation (thousands of documents processed in the background with status polling and webhooks).

Report Flow is aimed at developers and operations teams who currently hardcode PDF layouts in their backend and want a no-code/low-code way to design documents once, then generate them programmatically from their own applications, ERPs, or AI agents (via MCP).

Core User Roles

Owner/Admin — manages the company workspace, billing, API keys, OAuth clients, team members.

Editor — creates and edits templates, previews and tests generation.

Developer — manages API keys, OAuth clients, webhooks, views API logs/usage.

Viewer — read-only access to templates and generated document history.

The platform is multi-tenant: every workspace ("company") is fully isolated (data, templates, API keys, generated files, usage/billing).

1. Visual Template Editor

This is the centerpiece of the product. Build a canvas-based editor (similar to Canva/Figma-lite) for designing paginated documents:

Canvas sized to real paper formats (A4, Letter, custom), with page margins, multiple pages, and page-break handling for repeating content (e.g. invoice line items that overflow to a second page).

Drag-and-drop elements: text blocks, dynamic data fields (merge tags), tables/repeating rows (for line items), images/logo upload, shapes/dividers, QR code / barcode blocks, page number / date placeholders.

Data binding panel: define a JSON schema of variables for the template (e.g. customer.name, invoice.number, items[].description, items[].qty, items[].unit_price, totals.subtotal, totals.tax, totals.grand_total). Each element on the canvas can be bound to a variable, with support for formatting (currency, date format, number precision) and simple expressions/formulas (e.g. qty * unit_price).

Repeating regions / tables: a table element bound to an array variable (e.g. line items) that automatically repeats rows and grows the page.

Conditional visibility: show/hide an element based on a variable (e.g. hide "discount" row if discount == 0).

Styling controls: font family/size/weight/color, alignment, borders, backgrounds, spacing — with a small set of reusable "Theme" presets (brand color, logo, font) that can be applied across templates.

Live preview mode: paste/upload sample JSON data and see the template rendered with real values before publishing.

Template versioning: every save creates a version; users can view history and roll back. Only published versions are used by the API (drafts are editable without affecting live API calls).

Template library: starter templates for Invoice, Quotation, Purchase Order, Receipt, Delivery Note — duplicable and customizable.

2. Document Generation Engine

Templates + input JSON data → rendered PDF (primary output). Also support PNG/JPEG export of the first page (for thumbnails/previews).

Synchronous generation: POST /v1/documents/generate — for a single document, returns the PDF (binary or a signed download URL) directly in the response within seconds. Used for on-demand, user-facing generation (e.g. "download invoice" button).

Asynchronous batch generation: POST /v1/documents/batch — accepts an array of {template_id, data} payloads (up to configurable limits, e.g. 10,000 per batch), queues them, and immediately returns a batch_id with status queued. Processing happens in the background (worker queue). Batch status transitions: queued → processing → completed | completed_with_errors | failed.

GET /v1/batches/{batch_id} — poll for status, progress (processed/total), and per-item results (success + file URL, or error).

Webhooks: users can register a webhook URL (per workspace or per batch) that receives a POST callback when a batch completes or when each document finishes, with HMAC-signed payloads for verification.

Generated files are stored (object storage) with signed, expiring download URLs; also list/download them from the dashboard's Document History page.

3. REST API

Design and document a clean REST API (expose interactive docs, e.g. OpenAPI/Swagger UI, inside the app at /developers/api-docs):

Templates

GET /v1/templates — list templates

GET /v1/templates/{id} — get template + schema

POST /v1/templates / PUT /v1/templates/{id} — programmatic template management (optional, editor-first product but API access for power users)

Generation

POST /v1/documents/generate — sync, single document

POST /v1/documents/batch — async batch

GET /v1/batches/{batch_id} — batch status

GET /v1/documents/{id} — metadata + download URL for a previously generated document

Account/meta

GET /v1/usage — current usage against plan limits

GET /v1/webhooks, POST /v1/webhooks — manage webhook endpoints

All endpoints must return consistent JSON error shapes (error.code, error.message, error.details), support pagination (limit/cursor), and be rate-limited per workspace/plan with 429 + Retry-After headers.

4. MCP Server

Expose an MCP (Model Context Protocol) server so AI agents (e.g. Claude, other LLM tools) can generate documents directly. Design MCP tools that mirror the REST API:

list_templates — returns available templates and their variable schemas.

get_template_schema — returns the JSON schema/fields a given template expects.

generate_document — takes template_id + structured data, returns a document (sync) or a job reference.

get_batch_status — checks progress of an async batch started via MCP or the API.

The MCP server should authenticate using the same API key (appkey) mechanism as the REST API. Document, inside the app (/developers/mcp), how to connect Report Flow's MCP server URL + appkey into an MCP-compatible client, with example tool-call payloads.

5. Authentication & Authorization

Support two authentication mechanisms for API/MCP access, selectable per integration:

API Key ("appkey")

Generated per workspace from /developers/api-keys, shown once on creation, stored hashed.

Sent as a header, e.g. Authorization: Bearer <appkey> or X-App-Key: <appkey>.

Support multiple keys per workspace (e.g. "Production", "Staging"), each with an optional label, creation date, last-used timestamp, and ability to revoke.

Optional scoping: read-only keys vs. generate-capable keys.

OAuth 2.0

Client Credentials grant for server-to-server integrations (issue client_id/client_secret, exchange for a short-lived bearer access token via /oauth/token).

Authorization Code grant (with PKCE) for third-party apps acting on behalf of a user/workspace, with a consent screen listing requested scopes (templates:read, documents:generate, batches:read, etc.).

Token introspection/revocation endpoints.

Human users authenticate to the dashboard itself via email/password + optional SSO (Google), separate from the API auth above.

6. Dashboard / Application Pages

Onboarding — create workspace, pick industry/template starter, invite team.

Templates — grid of templates (draft/published badges), "New Template" → visual editor.

Template Editor — the canvas builder described in Section 1.

Document History — searchable/filterable log of generated documents (template used, status, generated by which key/user, download link, timestamp).

Batches — list of async batch jobs with progress bars, per-item drill-down, retry-failed-items action.

Developers — API keys, OAuth clients, webhooks, API docs (Swagger UI), MCP connection guide, request logs.

Usage & Billing — plan, quota (documents/month, storage), usage charts, upgrade CTA.

Team & Settings — members/roles, workspace branding (used as default theme in editor), audit log.

7. Suggested Tech Stack (Lovable defaults)

Frontend: React + TypeScript, Vite, Tailwind CSS, shadcn/ui components, TanStack Query for data fetching, Zod + React Hook Form for forms/validation, dnd-kit (or similar) for the drag-and-drop canvas.

Backend/data: Supabase (Postgres + Auth + Storage + Edge Functions) for the dashboard app; a separate queue/worker (e.g. Supabase Edge Functions + a job queue table, or an external worker) for async batch PDF rendering.

PDF rendering: server-side rendering of the template JSON (HTML/CSS-based layout engine or headless browser rendering) into PDF.

Multi-tenancy: every table scoped by company_id, enforced via Postgres Row Level Security; soft deletes (deleted_at) on user-facing records; all timestamps stored in UTC.

8. Core Data Model (high level)

companies (workspace)

users, company_members (role: admin/editor/developer/viewer)

templates (id, company_id, name, status: draft/published, current_version_id)

template_versions (template_id, schema JSON, layout JSON, created_at)

documents (id, company_id, template_id, version_id, status, file_url, data_snapshot, generated_by [api_key_id/user_id/oauth_client_id], created_at)

batches (id, company_id, status, total_count, processed_count, failed_count)

batch_items (batch_id, document_id, status, error)

api_keys (company_id, name, hashed_key, scopes, last_used_at, revoked_at)

oauth_clients, oauth_tokens

webhooks (company_id, url, secret, events[])

usage_counters (company_id, period, documents_generated, storage_bytes)

9. Non-Functional Requirements

Rate limiting and quota enforcement per plan tier.

Signed, time-expiring URLs for all generated file downloads.

HMAC-signed webhook payloads with a documented verification example.

Clear empty/loading/error states throughout the dashboard; optimistic UI where safe.

Responsive design; the visual editor targets desktop but the rest of the dashboard should work on tablet/mobile for viewing history and usage.

Clean, modern SaaS visual style — not a generic template look: pick a distinct accent color, real typographic hierarchy, and polish on the editor's canvas interactions (snapping, alignment guides, hover states).

Build Priority (for Lovable to sequence work)

Auth + workspace/multi-tenancy scaffolding

Template data model + basic (non-drag-and-drop) template CRUD

Visual editor: canvas, text/data-field elements, repeating table, preview with sample JSON

PDF generation (sync single-document endpoint) wired to a real template

API key auth + developer API docs page

Async batch generation + status polling + webhooks

OAuth 2.0 (client credentials, then authorization code + PKCE)

MCP server exposing list_templates / generate_document / get_batch_status

Document history, usage/billing, team management polish
