/**
 * Shared handler logic for the v1 REST API.
 *
 * These functions are imported by the API route files in `src/routes/`.
 * They contain the business logic and return structured data or throw
 * errors that the route handlers convert into JSON responses.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderPdf } from "./pdf-render";
import type { Json } from "@/integrations/supabase/types";
import type { TemplateLayout, PageSetup } from "@/types/template";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Scope validation
// ---------------------------------------------------------------------------

export function requireScope(scopes: string[], required: string): void {
  if (!scopes.includes(required)) {
    throw new ApiError(403, "FORBIDDEN", `Missing required scope: ${required}`);
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/templates — List templates for the company
// ---------------------------------------------------------------------------

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  doc_type: string;
  status: "draft" | "published";
  page_format: string;
  updated_at: string;
}

export async function handleListTemplates(companyId: string): Promise<TemplateListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("templates")
    .select("id, name, description, doc_type, status, page_format, updated_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "INTERNAL", "Failed to fetch templates");
  }

  return (data ?? []) as TemplateListItem[];
}

// ---------------------------------------------------------------------------
// POST /api/v1/documents/generate — Generate a document
// ---------------------------------------------------------------------------

export interface GenerateDocumentInput {
  templateId: string;
  data: Record<string, unknown>;
}

export interface GenerateDocumentResult {
  documentId: string;
  signedUrl: string;
}

export async function handleGenerateDocument(
  companyId: string,
  input: GenerateDocumentInput,
  keyId?: string,
): Promise<GenerateDocumentResult> {
  // 1. Fetch template and verify ownership + published status
  const { data: template, error: templateError } = await supabaseAdmin
    .from("templates")
    .select("id, status, current_version_id, company_id")
    .eq("id", input.templateId)
    .eq("company_id", companyId)
    .single();

  if (templateError || !template) {
    throw new ApiError(404, "NOT_FOUND", "Template not found or access denied");
  }

  if (template.status !== "published") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Template must be published before generating documents",
    );
  }

  if (!template.current_version_id) {
    throw new ApiError(400, "VALIDATION_ERROR", "Template has no published version");
  }

  // 2. Fetch the published template version
  const { data: version, error: versionError } = await supabaseAdmin
    .from("template_versions")
    .select("id, layout, page")
    .eq("id", template.current_version_id)
    .single();

  if (versionError || !version) {
    throw new ApiError(500, "INTERNAL", "Failed to load template version");
  }

  const layout = version.layout as unknown as TemplateLayout;
  const page = version.page as unknown as PageSetup;

  if (!layout?.elements || !page?.width) {
    throw new ApiError(
      500,
      "INTERNAL",
      "Template version has invalid layout or page configuration",
    );
  }

  // 3. Render PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf(layout, page, input.data);
  } catch (renderError) {
    throw new ApiError(
      500,
      "RENDER_FAILED",
      `PDF rendering failed: ${renderError instanceof Error ? renderError.message : "Unknown error"}`,
    );
  }

  // 4. Create document record (status: generating)
  const documentId = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin.from("documents").insert({
    id: documentId,
    company_id: companyId,
    template_id: input.templateId,
    version_id: version.id,
    status: "generating",
    data_snapshot: input.data as unknown as Json,
    generated_by: keyId ?? null,
  });

  if (insertError) {
    throw new ApiError(500, "INTERNAL", `Failed to create document record: ${insertError.message}`);
  }

  // 5. Upload PDF to storage
  const storagePath = `${companyId}/documents/${documentId}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("reportflow-bucket")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    await supabaseAdmin.from("documents").update({ status: "failed" }).eq("id", documentId);
    throw new ApiError(500, "STORAGE_ERROR", `Failed to upload PDF: ${uploadError.message}`);
  }

  // 6. Update document record with file URL
  const { error: updateError } = await supabaseAdmin
    .from("documents")
    .update({ status: "completed", file_url: storagePath })
    .eq("id", documentId);

  if (updateError) {
    // Rollback: delete the uploaded file if status update fails
    await supabaseAdmin.storage.from("reportflow-bucket").remove([storagePath]);
    throw new ApiError(500, "INTERNAL", `Failed to update document status: ${updateError.message}`);
  }

  // 7. Generate signed URL (1 hour expiry)
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
    .from("reportflow-bucket")
    .createSignedUrl(storagePath, 3600);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    throw new ApiError(
      500,
      "INTERNAL",
      `Failed to generate signed URL: ${signedUrlError?.message ?? "Unknown error"}`,
    );
  }

  return { documentId, signedUrl: signedUrlData.signedUrl };
}

// ---------------------------------------------------------------------------
// GET /api/v1/documents/:documentId — Get document metadata + download URL
// ---------------------------------------------------------------------------

export interface DocumentDetail {
  id: string;
  company_id: string;
  template_id: string;
  version_id: string | null;
  status: string;
  file_url: string | null;
  data_snapshot: Record<string, unknown>;
  created_at: string;
  signedUrl: string | null;
}

export async function handleGetDocument(
  companyId: string,
  documentId: string,
): Promise<DocumentDetail> {
  const { data: doc, error } = await supabaseAdmin
    .from("documents")
    .select("id, company_id, template_id, version_id, status, file_url, data_snapshot, created_at")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .single();

  if (error || !doc) {
    throw new ApiError(404, "NOT_FOUND", "Document not found or access denied");
  }

  // Generate signed URL if the document has a file
  let signedUrl: string | null = null;
  if (doc.file_url) {
    const { data: signedUrlData } = await supabaseAdmin.storage
      .from("reportflow-bucket")
      .createSignedUrl(doc.file_url, 3600);
    signedUrl = signedUrlData?.signedUrl ?? null;
  }

  return {
    ...doc,
    data_snapshot: doc.data_snapshot as Record<string, unknown>,
    signedUrl,
  };
}
