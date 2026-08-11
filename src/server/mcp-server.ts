/**
 * MCP Server for Report Flow.
 *
 * Exposes tools for listing templates, fetching template schemas,
 * generating documents, and checking batch status via the Model Context Protocol.
 *
 * Uses API key authentication from environment or command-line args.
 * Communicates over stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateApiKey, type ApiKeyValidation } from "@/functions/api-keys";
import { renderPdf } from "@/server/pdf-render";
import type { TemplateLayout, PageSetup, SchemaField } from "@/types/template";
import type { Json } from "@/integrations/supabase/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthContext {
  companyId: string;
  scopes: string[];
  keyId: string;
}

// ── Auth Middleware ───────────────────────────────────────────────────────────

/**
 * Validate the API key and return auth context.
 * Returns null if the key is invalid or revoked.
 */
async function authenticateApiKey(apiKey: string): Promise<AuthContext | null> {
  const result: ApiKeyValidation | null = await validateApiKey(apiKey);
  if (!result) {
    return null;
  }
  return {
    companyId: result.companyId,
    scopes: result.scopes,
    keyId: result.keyId,
  };
}

function requireScope(auth: AuthContext, scope: string): void {
  if (!auth.scopes.includes(scope)) {
    throw new Error(`Missing required scope: ${scope}`);
  }
}

// ── Server Setup ─────────────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "reportflow",
    version: "1.0.0",
  });

  // ── Tool 1: list_templates ───────────────────────────────────────────────

  server.tool(
    "list_templates",
    "List all templates for the authenticated company. Returns template id, name, status, doc_type, and variable schema.",
    {},
    async (_args: any, extra: any) => {
      try {
        const auth = await getAuthFromRequest(extra);
        requireScope(auth, "read");

        const { data, error } = await supabaseAdmin
          .from("templates")
          .select(
            "id, name, description, doc_type, status, page_format, updated_at, current_version_id",
          )
          .eq("company_id", auth.companyId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false });

        if (error) {
          throw new Error(`Failed to fetch templates: ${error.message}`);
        }

        // Enrich each template with its variable schema from the current version
        const templates = await Promise.all(
          (data ?? []).map(async (tpl) => {
            let variableSchema: SchemaField[] = [];

            if (tpl.current_version_id) {
              const { data: version } = await supabaseAdmin
                .from("template_versions")
                .select("data_schema")
                .eq("id", tpl.current_version_id)
                .single();

              if (version?.data_schema) {
                variableSchema = version.data_schema as unknown as SchemaField[];
              }
            }

            return {
              id: tpl.id,
              name: tpl.name,
              description: tpl.description,
              doc_type: tpl.doc_type,
              status: tpl.status,
              page_format: tpl.page_format,
              updated_at: tpl.updated_at,
              variable_schema: variableSchema,
            };
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ templates }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tool 2: get_template_schema ──────────────────────────────────────────

  server.tool(
    "get_template_schema",
    "Get detailed template information including layout, sample data, and data schema for a specific template version.",
    {
      template_id: z.string().describe("The template ID to fetch schema for"),
    },
    async (args: any, extra: any) => {
      try {
        const auth = await getAuthFromRequest(extra);
        requireScope(auth, "read");

        // Fetch template to verify ownership
        const { data: template, error: tplError } = await supabaseAdmin
          .from("templates")
          .select("id, name, status, current_version_id, company_id")
          .eq("id", args.template_id)
          .eq("company_id", auth.companyId)
          .single();

        if (tplError || !template) {
          throw new Error("Template not found or access denied");
        }

        if (!template.current_version_id) {
          throw new Error("Template has no published version");
        }

        // Fetch the template version with full details
        const { data: version, error: verError } = await supabaseAdmin
          .from("template_versions")
          .select("id, version, layout, page, sample_data, data_schema, note, created_at")
          .eq("id", template.current_version_id)
          .single();

        if (verError || !version) {
          throw new Error("Failed to load template version");
        }

        const layout = version.layout as unknown as TemplateLayout;
        const page = version.page as unknown as PageSetup;
        const sampleData = version.sample_data as Record<string, unknown>;
        const dataSchema = version.data_schema as unknown as SchemaField[];

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  template_id: template.id,
                  name: template.name,
                  status: template.status,
                  version_id: version.id,
                  version_number: version.version,
                  note: version.note,
                  created_at: version.created_at,
                  page,
                  layout,
                  sample_data: sampleData,
                  data_schema: dataSchema,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tool 3: generate_document ────────────────────────────────────────────

  server.tool(
    "generate_document",
    "Generate a PDF document from a template with the provided data. Returns document ID and a signed download URL.",
    {
      template_id: z.string().describe("The template ID to use for generation"),
      data: z.record(z.string(), z.any()).describe("Template data object with variable values"),
    },
    async (args: any, extra: any) => {
      try {
        const auth = await getAuthFromRequest(extra);
        requireScope(auth, "generate");

        // 1. Fetch template and verify ownership + published status
        const { data: template, error: templateError } = await supabaseAdmin
          .from("templates")
          .select("id, status, current_version_id, company_id")
          .eq("id", args.template_id)
          .eq("company_id", auth.companyId)
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

        // 2. Fetch the published template version
        const { data: version, error: versionError } = await supabaseAdmin
          .from("template_versions")
          .select("id, layout, page")
          .eq("id", template.current_version_id)
          .single();

        if (versionError || !version) {
          throw new Error("Failed to load template version");
        }

        const layout = version.layout as unknown as TemplateLayout;
        const page = version.page as unknown as PageSetup;

        if (!layout?.elements || !page?.width) {
          throw new Error("Template version has invalid layout or page configuration");
        }

        // 3. Render PDF
        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await renderPdf(layout, page, args.data);
        } catch (renderError) {
          throw new Error(
            `PDF rendering failed: ${renderError instanceof Error ? renderError.message : "Unknown error"}`,
          );
        }

        // 4. Create document record (status: generating)
        const documentId = crypto.randomUUID();
        const { error: insertError } = await supabaseAdmin.from("documents").insert({
          id: documentId,
          company_id: auth.companyId,
          template_id: args.template_id,
          version_id: version.id,
          status: "generating",
          data_snapshot: args.data as unknown as Json,
          generated_by: auth.keyId,
        });

        if (insertError) {
          throw new Error(`Failed to create document record: ${insertError.message}`);
        }

        // 5. Upload PDF to storage
        const storagePath = `${auth.companyId}/documents/${documentId}.pdf`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("reportflow-bucket")
          .upload(storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) {
          await supabaseAdmin.from("documents").update({ status: "failed" }).eq("id", documentId);
          throw new Error(`Failed to upload PDF: ${uploadError.message}`);
        }

        // 6. Update document record with file URL
        const { error: updateError } = await supabaseAdmin
          .from("documents")
          .update({ status: "completed", file_url: storagePath })
          .eq("id", documentId);

        if (updateError) {
          await supabaseAdmin.storage.from("reportflow-bucket").remove([storagePath]);
          throw new Error(`Failed to update document status: ${updateError.message}`);
        }

        // 7. Generate signed URL (1 hour expiry)
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
          .from("reportflow-bucket")
          .createSignedUrl(storagePath, 3600);

        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error(
            `Failed to generate signed URL: ${signedUrlError?.message ?? "Unknown error"}`,
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  document_id: documentId,
                  signed_url: signedUrlData.signedUrl,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tool 4: get_batch_status ─────────────────────────────────────────────

  server.tool(
    "get_batch_status",
    "Get the status and progress of a batch generation job, including per-item results.",
    {
      batch_id: z.string().describe("The batch ID to check status for"),
    },
    async (args: any, extra: any) => {
      try {
        const auth = await getAuthFromRequest(extra);
        requireScope(auth, "read");

        // Fetch batch record
        const { data: batch, error: batchError } = await supabaseAdmin
          .from("batches")
          .select(
            "id, name, status, total_count, processed_count, failed_count, created_at, updated_at",
          )
          .eq("id", args.batch_id)
          .eq("company_id", auth.companyId)
          .single();

        if (batchError || !batch) {
          throw new Error("Batch not found or access denied");
        }

        // Fetch batch items
        const { data: items, error: itemsError } = await supabaseAdmin
          .from("batch_items")
          .select("id, template_id, status, document_id, error, created_at")
          .eq("batch_id", args.batch_id)
          .order("created_at", { ascending: true });

        if (itemsError) {
          throw new Error(`Failed to fetch batch items: ${itemsError.message}`);
        }

        const progress =
          batch.total_count > 0 ? Math.round((batch.processed_count / batch.total_count) * 100) : 0;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  batch_id: batch.id,
                  name: batch.name,
                  status: batch.status,
                  total_count: batch.total_count,
                  processed_count: batch.processed_count,
                  failed_count: batch.failed_count,
                  progress_percent: progress,
                  created_at: batch.created_at,
                  updated_at: batch.updated_at,
                  items: (items ?? []).map((item) => ({
                    id: item.id,
                    template_id: item.template_id,
                    status: item.status,
                    document_id: item.document_id,
                    error: item.error,
                    created_at: item.created_at,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ── Auth Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract API key from MCP request metadata and authenticate.
 * The API key is passed via the `_meta` field or environment variable.
 */
async function getAuthFromRequest(extra: any): Promise<AuthContext> {
  // Try to get API key from request metadata
  const apiKey =
    (extra?.metadata?.["apiKey"] as string | undefined) ??
    (extra?.metadata?.["api_key"] as string | undefined) ??
    process.env["REPORTFLOW_API_KEY"];

  if (!apiKey) {
    throw new Error(
      "API key required. Provide via REPORTFLOW_API_KEY env var or apiKey in request metadata.",
    );
  }

  const auth = await authenticateApiKey(apiKey);
  if (!auth) {
    throw new Error("Invalid or revoked API key");
  }

  return auth;
}
