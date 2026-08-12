import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderPdf } from "@/server/pdf-render";
import type { TemplateLayout, PageSetup } from "@/types/template";
import type { Json } from "@/integrations/supabase/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  templateId: string;
  data: Record<string, unknown>;
}

interface GenerateResponse {
  documentId: string;
  signedUrl: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the authenticated user's company ID from company_members.
 * Throws if the user is not a member of any company.
 */
async function getUserCompanyId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve company: ${error.message}`);
  }
  if (!data) {
    throw new Error("User is not a member of any company");
  }

  return data.company_id;
}

// ── Server Function ──────────────────────────────────────────────────────────

/**
 * Synchronous PDF generation server function.
 *
 * 1. Validates the user belongs to a company
 * 2. Fetches template + latest version
 * 3. Verifies template is published
 * 4. Renders PDF from layout + data
 * 5. Uploads to storage and creates a document record
 * 6. Returns a signed URL for download
 */
export const generateDocument = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: GenerateRequest) => input)
  .handler(async ({ data, context }): Promise<GenerateResponse> => {
    const companyId = await getUserCompanyId(context!.userId);

    // 1. Fetch template and verify it exists and is published
    const { data: template, error: templateError } = await supabaseAdmin
      .from("templates")
      .select("id, status, current_version_id, company_id")
      .eq("id", data.templateId)
      .eq("company_id", companyId)
      .single();

    if (templateError || !template) {
      throw new Error("Template not found or access denied");
    }

    if (template.status !== "published") {
      throw new Error("Template must be published before generating documents");
    }

    if (!template.current_version_id) {
      throw new Error("Template has no published version");
    }

    // 2. Fetch the latest template version with layout and page data
    const { data: version, error: versionError } = await supabaseAdmin
      .from("template_versions")
      .select("id, layout, page")
      .eq("id", template.current_version_id)
      .single();

    if (versionError || !version) {
      throw new Error("Failed to load template version");
    }

    // 3. Parse layout and page from version JSON columns
    const layout = version.layout as unknown as TemplateLayout;
    const page = version.page as unknown as PageSetup;

    if (!layout?.elements || !page?.width) {
      throw new Error("Template version has invalid layout or page configuration");
    }

    // 4. Create document record FIRST (status: generating)
    const documentId = crypto.randomUUID();
    const { error: insertError } = await supabaseAdmin.from("documents").insert({
      id: documentId,
      company_id: companyId,
      template_id: data.templateId,
      version_id: version.id,
      status: "generating",
      data_snapshot: data.data as unknown as Json,
      generated_by: context!.userId,
    });

    if (insertError) {
      throw new Error(`Failed to create document record: ${insertError.message}`);
    }

    // 5. Render PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderPdf(layout, page, data.data);
    } catch (renderError) {
      const errorMsg = renderError instanceof Error ? renderError.message : "Unknown render error";
      await supabaseAdmin
        .from("documents")
        .update({ status: "failed", error: errorMsg })
        .eq("id", documentId);
      throw new Error(`PDF rendering failed: ${errorMsg}`);
    }

    // 6. Upload PDF to storage
    const storagePath = `${companyId}/documents/${documentId}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("reportflow-bucket")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      await supabaseAdmin
        .from("documents")
        .update({ status: "failed", error: uploadError.message })
        .eq("id", documentId);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // 7. Update document record with file URL and completed status
    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({
        status: "completed",
        file_url: storagePath,
      })
      .eq("id", documentId);

    if (updateError) {
      // Rollback: delete the uploaded file if status update fails
      await supabaseAdmin.storage.from("reportflow-bucket").remove([storagePath]);
      throw new Error(`Failed to update document status: ${updateError.message}`);
    }

    // 8. Generate signed URL (1 hour expiry)
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from("reportflow-bucket")
      .createSignedUrl(storagePath, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(
        `Failed to generate signed URL: ${signedUrlError?.message ?? "Unknown error"}`,
      );
    }

    return {
      documentId,
      signedUrl: signedUrlData.signedUrl,
    };
  });
