import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { STARTERS, getStarter } from "@/lib/starter-templates";
import { exportTemplate, downloadTemplateJson, importTemplate } from "@/lib/template-io";
import type { TemplateExportData } from "@/lib/template-io";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { jsonValue } from "@/lib/json";

const DOC_TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "invoice", label: "Invoice" },
  { value: "quotation", label: "Quotation" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "receipt", label: "Receipt" },
  { value: "delivery_note", label: "Delivery Note" },
  { value: "contract", label: "Contract" },
] as const;

const STATUS_OPTIONS = ["all", "draft", "published"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export const Route = createFileRoute("/_authenticated/templates/")({
  head: () => ({
    meta: [
      { title: "Templates — Report Flow" },
      {
        name: "description",
        content: "Browse, duplicate and edit the document templates in your Report Flow workspace.",
      },
      { property: "og:title", content: "Templates — Report Flow" },
      { property: "og:description", content: "Your workspace's document templates." },
    ],
  }),
  component: TemplatesPage,
});

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  doc_type: string;
  status: "draft" | "published";
  page_format: string;
  updated_at: string;
}

function OnboardingCard() {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const queryClient = useQueryClient();
  const { refetch } = useWorkspace();

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_workspace", {
        _name: name,
        ...(industry.trim() ? { _industry: industry.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await refetch();
      toast.success("Workspace created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-7 shadow-panel">
      <Sparkles className="size-5 text-primary" />
      <h2 className="text-display mt-4 text-lg font-semibold">Create your workspace</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Every template, API key and generated document lives inside a workspace.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Company name</Label>
          <Input
            id="ws-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nusantara Digital"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-industry">Industry (optional)</Label>
          <Input
            id="ws-industry"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="SaaS, logistics, manufacturing…"
          />
        </div>
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending && <Loader2 className="size-4 animate-spin" />} Create workspace
        </Button>
      </form>
    </div>
  );
}

function NewTemplateDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [starterKey, setStarterKey] = useState("invoice");
  const [name, setName] = useState("Invoice");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const starter = getStarter(starterKey);
      const doc = starter.build();
      const { data: template, error } = await supabase
        .from("templates")
        .insert({
          company_id: companyId,
          name: name.trim() || starter.name,
          description: starter.description,
          doc_type: starter.docType,
          page_format: doc.page.format,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: versionError } = await supabase.from("template_versions").insert({
        template_id: template.id,
        company_id: companyId,
        version: 1,
        data_schema: jsonValue(doc.schema),
        layout: jsonValue(doc.layout),
        page: jsonValue(doc.page),
        sample_data: jsonValue(doc.sampleData),
        note: `Created from ${starter.name} starter`,
      });
      if (versionError) throw versionError;
      return template.id as string;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setOpen(false);
      navigate({ to: "/templates/$templateId", params: { templateId: id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>
            Start from a document type, then customise the layout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map((starter) => (
              <button
                key={starter.key}
                type="button"
                onClick={() => {
                  setStarterKey(starter.key);
                  setName(starter.name);
                }}
                className={cn(
                  "rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-border-strong",
                  starterKey === starter.key && "border-primary bg-primary/5",
                )}
              >
                <p className="text-sm font-medium">{starter.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {starter.description}
                </p>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input id="tpl-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create and open editor
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  docTypeFilter,
  onDocTypeChange,
  counts,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  docTypeFilter: string;
  onDocTypeChange: (value: string) => void;
  counts: { all: number; draft: number; published: number };
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search templates..."
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex items-center rounded-lg bg-muted p-1 text-muted-foreground">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                statusFilter === status
                  ? "bg-background text-foreground shadow"
                  : "hover:text-foreground",
              )}
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="text-xs text-muted-foreground">{counts[status]}</span>
            </button>
          ))}
        </div>

        <Select value={docTypeFilter} onValueChange={onDocTypeChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ImportTemplateDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as TemplateExportData;
      const templateId = await importTemplate(data, companyId);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(`Template "${data.name}" imported successfully`);
      setOpen(false);
      navigate({ to: "/templates/$templateId", params: { templateId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import template";
      toast.error(message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import template</DialogTitle>
          <DialogDescription>
            Upload a JSON file exported from Report Flow to create a new template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div
            className="flex flex-col items-center rounded-xl border-2 border-dashed border-border bg-surface/50 px-6 py-10 text-center"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {importing ? "Importing..." : "Click to select a JSON file"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Accepts .json files exported from Report Flow
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
              disabled={importing}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesPage() {
  const { workspace, isLoading, canEdit } = useWorkspace();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [docTypeFilter, setDocTypeFilter] = useState("all");

  const debouncedSearch = useDebouncedValue(search);

  const templates = useQuery({
    queryKey: ["templates", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, description, doc_type, status, page_format, updated_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const filteredTemplates = useMemo(() => {
    if (!templates.data) return [];
    return templates.data.filter((tpl) => {
      if (debouncedSearch && !tpl.name.toLowerCase().includes(debouncedSearch.toLowerCase())) {
        return false;
      }
      if (statusFilter !== "all" && tpl.status !== statusFilter) {
        return false;
      }
      if (docTypeFilter !== "all" && tpl.doc_type !== docTypeFilter) {
        return false;
      }
      return true;
    });
  }, [templates.data, debouncedSearch, statusFilter, docTypeFilter]);

  const counts = useMemo(() => {
    const base = templates.data ?? [];
    const searchMatch = (tpl: TemplateRow) =>
      !debouncedSearch || tpl.name.toLowerCase().includes(debouncedSearch.toLowerCase());
    const docTypeMatch = (tpl: TemplateRow) =>
      docTypeFilter === "all" || tpl.doc_type === docTypeFilter;

    const searchAndDocFiltered = base.filter((tpl) => searchMatch(tpl) && docTypeMatch(tpl));

    return {
      all: searchAndDocFiltered.length,
      draft: searchAndDocFiltered.filter((t) => t.status === "draft").length,
      published: searchAndDocFiltered.filter((t) => t.status === "published").length,
    };
  }, [templates.data, debouncedSearch, docTypeFilter]);

  const hasActiveFilters = debouncedSearch || statusFilter !== "all" || docTypeFilter !== "all";

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setDocTypeFilter("all");
  }, []);

  if (isLoading) {
    return (
      <AppShell title="Templates">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!workspace) {
    return (
      <AppShell>
        <div className="py-16">
          <OnboardingCard />
        </div>
      </AppShell>
    );
  }

  const hasTemplates = (templates.data?.length ?? 0) > 0;

  return (
    <AppShell
      title="Templates"
      description="Design once, then render from the API. Published versions are the ones the API uses."
      actions={
        canEdit ? (
          <div className="flex gap-2">
            <ImportTemplateDialog companyId={workspace.id} />
            <NewTemplateDialog companyId={workspace.id} />
          </div>
        ) : undefined
      }
    >
      {templates.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !hasTemplates ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-6" />
          </span>
          <h2 className="text-display mt-5 text-lg font-semibold">No templates yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Start from an invoice, quotation or delivery note — every starter is fully editable.
          </p>
          {canEdit && (
            <div className="mt-6">
              <NewTemplateDialog companyId={workspace.id} />
            </div>
          )}
        </div>
      ) : (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            docTypeFilter={docTypeFilter}
            onDocTypeChange={setDocTypeFilter}
            counts={counts}
          />

          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Search className="size-6" />
              </span>
              <h2 className="text-display mt-5 text-lg font-semibold">
                No templates match your filters
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Try adjusting your search or filter criteria.
              </p>
              {hasActiveFilters && (
                <Button variant="outline" className="mt-6" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to="/templates/$templateId"
                      params={{ templateId: template.id }}
                      className="text-[15px] leading-snug font-semibold group-hover:text-primary"
                    >
                      {template.name}
                    </Link>
                    <Badge variant={template.status === "published" ? "default" : "secondary"}>
                      {template.status}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {template.description ?? "No description"}
                  </p>
                  <div className="text-mono mt-auto flex items-center gap-3 pt-5 text-[11px] text-muted-foreground">
                    <span>{template.page_format}</span>
                    <span>·</span>
                    <span>{(template.doc_type ?? "document").replace("_", " ")}</span>
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const data = await exportTemplate(template.id);
                          downloadTemplateJson(data);
                          toast.success("Template exported");
                        } catch (err) {
                          const message = err instanceof Error ? err.message : "Export failed";
                          toast.error(message);
                        }
                      }}
                    >
                      <Download className="size-3" />
                      Export
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
