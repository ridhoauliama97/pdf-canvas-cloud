import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderPdf } from "@/server/pdf-render";
import { notifyBatchComplete } from "./webhooks";
import type { TemplateLayout, PageSetup } from "@/types/template";
import type { Json } from "@/integrations/supabase/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface BatchItemInput {
  templateId: string;
  data: Record<string, unknown>;
}

interface CreateBatchInput {
  name?: string;
  items: BatchItemInput[];
}

// Batches and batch_items tables are not yet in Supabase generated types.
// We use type assertions for .from() calls to work around this.

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

/**
 * Process a single batch item: fetch template, render PDF, upload, create document.
 * Returns the documentId on success, or throws on failure.
 */
async function processBatchItem(
  companyId: string,
  userId: string,
  templateId: string,
  data: Record<string, unknown>,
): Promise<string> {
  // 1. Fetch template and verify it exists and is published
  const { data: template, error: templateError } = await supabaseAdmin
    .from("templates")
    .select("id, status, current_version_id, company_id")
    .eq("id", templateId)
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
    template_id: templateId,
    version_id: version.id,
    status: "generating",
    data_snapshot: data as unknown as Json,
    generated_by: userId,
  });

  if (insertError) {
    throw new Error(`Failed to create document record: ${insertError.message}`);
  }

  // 6. Render PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf(layout, page, data);
  } catch (renderError) {
    // Mark document as failed with error message
    const errorMsg = renderError instanceof Error ? renderError.message : "Unknown render error";
    await supabaseAdmin
      .from("documents")
      .update({ status: "failed", error: errorMsg })
      .eq("id", documentId);
    throw new Error(`PDF rendering failed: ${errorMsg}`);
  }

  // 7. Upload PDF to storage
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

  // 8. Update document record with file URL and completed status
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

  return documentId;
}

// ── Server Functions ─────────────────────────────────────────────────────────

/**
 * 1. createBatch — Create a batch job and process all items synchronously.
 *
 * - Creates a batch record with total_count = items.length
 * - Creates batch_items records for each item
 * - Processes each item: render PDF, upload, create document
 * - Updates batch status and counters after each item
 * - Returns { batchId, status, processedCount, failedCount }
 */
export const createBatch = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateBatchInput) => {
    if (!input.items || input.items.length === 0) {
      throw new Error("At least one batch item is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);
    const batchId = crypto.randomUUID();
    const totalCount = data.items.length;

    // 1. Create batch record

    const { error: batchError } = await (supabaseAdmin.from("batches") as any).insert({
      id: batchId,
      company_id: companyId,
      name: data.name ?? null,
      status: "processing",
      total_count: totalCount,
      processed_count: 0,
      failed_count: 0,
      created_by: context.userId,
    });

    if (batchError) {
      throw new Error(`Failed to create batch: ${batchError.message}`);
    }

    // 2. Create batch_items records
    const batchItems = data.items.map((item) => ({
      id: crypto.randomUUID(),
      batch_id: batchId,
      template_id: item.templateId,
      data: item.data as unknown as Json,
      status: "queued" as const,
    }));

    const { error: itemsError } = await (supabaseAdmin.from("batch_items") as any).insert(
      batchItems,
    );

    if (itemsError) {
      throw new Error(`Failed to create batch items: ${itemsError.message}`);
    }

    // 3. Process each item synchronously
    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      const itemData = data.items[i];

      if (!item || !itemData) {
        // Mark as failed — should not happen but guard against it

        if (item) {
          await (supabaseAdmin.from("batch_items") as any)
            .update({ status: "failed", error: "Item data not found" })
            .eq("id", item.id);
        }
        failedCount++;
        continue;
      }

      try {
        const documentId = await processBatchItem(
          companyId,
          context.userId,
          item.template_id,
          itemData.data,
        );

        // Mark item as completed

        await (supabaseAdmin.from("batch_items") as any)
          .update({ status: "completed", document_id: documentId })
          .eq("id", item.id);

        processedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Mark item as failed

        await (supabaseAdmin.from("batch_items") as any)
          .update({ status: "failed", error: errorMessage })
          .eq("id", item.id);

        failedCount++;
      }
    }

    // 4. Update batch final status
    const finalStatus = failedCount === 0 ? "completed" : "completed_with_errors";

    const { error: updateError } = await (supabaseAdmin.from("batches") as any)
      .update({
        status: finalStatus,
        processed_count: processedCount,
        failed_count: failedCount,
      })
      .eq("id", batchId);

    if (updateError) {
      throw new Error(`Failed to update batch status: ${updateError.message}`);
    }

    // Fire webhook notifications — non-blocking, failures are logged and swallowed
    await notifyBatchComplete(batchId, companyId);

    return {
      batchId,
      status: finalStatus,
      processedCount,
      failedCount,
    };
  });

/**
 * 2. getBatch — Get batch status with items and progress.
 *
 * Returns the batch record with its items, status, and progress info.
 */
export const getBatch = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);

    // Fetch batch record

    const { data: batch, error: batchError } = await (supabaseAdmin.from("batches") as any)
      .select("*")
      .eq("id", data.batchId)
      .eq("company_id", companyId)
      .single();

    if (batchError || !batch) {
      throw new Error("Batch not found or access denied");
    }

    // Fetch batch items

    const { data: items, error: itemsError } = await (supabaseAdmin.from("batch_items") as any)
      .select("*")
      .eq("batch_id", data.batchId)
      .order("created_at", { ascending: true });

    if (itemsError) {
      throw new Error(`Failed to fetch batch items: ${itemsError.message}`);
    }

    return {
      ...batch,
      items: items ?? [],
      progress: {
        total: batch.total_count,
        processed: batch.processed_count,
        failed: batch.failed_count,
        percentage:
          batch.total_count > 0
            ? Math.round(((batch.processed_count + batch.failed_count) / batch.total_count) * 100)
            : 0,
      },
    };
  });

/**
 * 3. listBatches — List all batches for the company.
 *
 * Returns batches ordered by created_at descending.
 */
export const listBatches = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { data, error } = await (supabaseAdmin.from("batches") as any)
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list batches: ${error.message}`);
    }

    return data ?? [];
  });

/**
 * 4. retryBatchItems — Retry failed items in a batch.
 *
 * Finds all failed items, resets their status to 'queued', and reprocesses them.
 * Returns the updated batch with new counters.
 */
export const retryBatchItems = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { batchId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);

    // Verify batch exists and belongs to user's company

    const { data: batch, error: batchError } = await (supabaseAdmin.from("batches") as any)
      .select("*")
      .eq("id", data.batchId)
      .eq("company_id", companyId)
      .single();

    if (batchError || !batch) {
      throw new Error("Batch not found or access denied");
    }

    // Find failed items

    const { data: failedItems, error: fetchError } = await (
      supabaseAdmin.from("batch_items") as any
    )
      .select("*")
      .eq("batch_id", data.batchId)
      .eq("status", "failed");

    if (fetchError) {
      throw new Error(`Failed to fetch failed items: ${fetchError.message}`);
    }

    if (!failedItems || failedItems.length === 0) {
      return {
        ...batch,
        retriedCount: 0,
      };
    }

    // Reset failed items to queued
    const resetPromises = failedItems.map((item: { id: string }) =>
      (supabaseAdmin.from("batch_items") as any)
        .update({ status: "queued", error: null, document_id: null })
        .eq("id", item.id),
    );

    await Promise.all(resetPromises);

    // Update batch status back to processing

    await (supabaseAdmin.from("batches") as any)
      .update({ status: "processing" })
      .eq("id", data.batchId);

    // Re-process each failed item
    let processedCount = 0;
    let failedCount = 0;

    for (const item of failedItems) {
      const itemData = item.data as Record<string, unknown>;

      try {
        const documentId = await processBatchItem(
          companyId,
          context.userId,
          item.template_id,
          itemData,
        );

        // Mark item as completed

        await (supabaseAdmin.from("batch_items") as any)
          .update({ status: "completed", document_id: documentId })
          .eq("id", item.id);

        processedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Mark item as failed again

        await (supabaseAdmin.from("batch_items") as any)
          .update({ status: "failed", error: errorMessage })
          .eq("id", item.id);

        failedCount++;
      }
    }

    // Update batch counters
    const newProcessedCount = batch.processed_count + processedCount;
    const newFailedCount = batch.failed_count - failedItems.length + failedCount;
    const finalStatus = newFailedCount === 0 ? "completed" : "completed_with_errors";

    const { error: updateError } = await (supabaseAdmin.from("batches") as any)
      .update({
        status: finalStatus,
        processed_count: newProcessedCount,
        failed_count: newFailedCount,
      })
      .eq("id", data.batchId);

    if (updateError) {
      throw new Error(`Failed to update batch status: ${updateError.message}`);
    }

    // Fire webhook notifications — non-blocking, failures are logged and swallowed
    await notifyBatchComplete(data.batchId, companyId);

    return {
      batchId: data.batchId,
      status: finalStatus,
      processedCount: newProcessedCount,
      failedCount: newFailedCount,
      retriedCount: failedItems.length,
    };
  });
