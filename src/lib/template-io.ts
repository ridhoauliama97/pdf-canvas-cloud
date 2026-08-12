import { supabase } from "@/integrations/supabase/client";
import { jsonValue } from "@/lib/json";
import type { PageSetup, SchemaField, TemplateLayout } from "@/types/template";

export interface TemplateExportData {
  version: 1;
  name: string;
  description: string | null;
  doc_type: string;
  page_format: string;
  layout: TemplateLayout;
  page: PageSetup;
  sample_data: Record<string, unknown>;
  schema: SchemaField[];
  exported_at: string;
}

/**
 * Export a template and its latest version as JSON.
 */
export async function exportTemplate(templateId: string): Promise<TemplateExportData> {
  const { data: template, error: tplErr } = await supabase
    .from("templates")
    .select("id, name, description, doc_type, page_format")
    .eq("id", templateId)
    .single();
  if (tplErr || !template) throw new Error(tplErr?.message ?? "Template not found");

  const { data: version, error: verErr } = await supabase
    .from("template_versions")
    .select("layout, page, sample_data, data_schema")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (verErr || !version) throw new Error(verErr?.message ?? "Template version not found");

  return {
    version: 1,
    name: template.name,
    description: template.description,
    doc_type: template.doc_type,
    page_format: template.page_format,
    layout: version.layout as unknown as TemplateLayout,
    page: version.page as unknown as PageSetup,
    sample_data: (version.sample_data as Record<string, unknown>) ?? {},
    schema: (version.data_schema as unknown as SchemaField[]) ?? [],
    exported_at: new Date().toISOString(),
  };
}

/**
 * Download a template export as a JSON file.
 */
export function downloadTemplateJson(data: TemplateExportData, filename?: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `${data.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a template from a JSON file upload.
 * Creates a new template and initial version.
 */
export async function importTemplate(data: TemplateExportData, companyId: string): Promise<string> {
  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  const { data: template, error: tplErr } = await supabase
    .from("templates")
    .insert({
      company_id: companyId,
      name: data.name,
      description: data.description,
      doc_type: data.doc_type,
      page_format: data.page_format,
    })
    .select("id")
    .single();
  if (tplErr || !template) throw new Error(tplErr?.message ?? "Failed to create template");

  const { error: verErr } = await supabase.from("template_versions").insert({
    template_id: template.id,
    company_id: companyId,
    version: 1,
    data_schema: jsonValue(data.schema),
    layout: jsonValue(data.layout),
    page: jsonValue(data.page),
    sample_data: jsonValue(data.sample_data),
    note: "Imported from JSON",
  });
  if (verErr) throw new Error(verErr.message ?? "Failed to create template version");

  return template.id;
}
