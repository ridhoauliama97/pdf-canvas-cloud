import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Document History — Report Flow" },
      {
        name: "description",
        content: "View and download all generated documents in your Report Flow workspace.",
      },
      { property: "og:title", content: "Document History — Report Flow" },
      { property: "og:description", content: "View and download all generated documents." },
    ],
  }),
  component: DocumentHistoryPage,
});

interface DocumentRow {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  source: "editor" | "api" | "batch";
  generated_by: string | null;
  created_at: string;
  file_url: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = ["all", "completed", "generating", "failed"] as const;
const SOURCE_OPTIONS = ["all", "editor", "api", "batch"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type SourceFilter = (typeof SOURCE_OPTIONS)[number];

const ITEMS_PER_PAGE = 10;

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function DocumentHistoryPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const debouncedSearch = useDebouncedValue(search);

  // Fetch templates for filter options
  const templates = useQuery({
    queryKey: ["templates", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async (): Promise<TemplateOption[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TemplateOption[];
    },
  });

  // Fetch documents with template names
  const documents = useQuery({
    queryKey: ["documents", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          `
          id,
          template_id,
          status,
          generated_by,
          created_at,
          file_url,
          templates(name)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch profiles for generated_by values
      const generatedByIds = [
        ...new Set((data ?? []).map((d: any) => d.generated_by).filter(Boolean)),
      ];
      const profilesMap: Record<string, string> = {};

      if (generatedByIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", generatedByIds);

        (profiles ?? []).forEach((p: any) => {
          profilesMap[p.id] = p.full_name;
        });
      }

      // Detect source for each document
      const docIds = (data ?? []).map((d: any) => d.id);
      const batchDocIds = new Set<string>();

      if (docIds.length > 0) {
        const { data: batchItems } = await supabase
          .from("batch_items")
          .select("document_id")
          .in("document_id", docIds);

        (batchItems ?? []).forEach((bi: any) => batchDocIds.add(bi.document_id));
      }

      return (data ?? []).map((doc: any) => {
        let source: "editor" | "api" | "batch" = "editor";
        if (batchDocIds.has(doc.id)) {
          source = "batch";
        } else if (doc.generated_by) {
          // Check if generated_by is an API key (starts with rf_)
          // For now, if generated_by exists and is not in profiles, it's likely an API key
          source = profilesMap[doc.generated_by] ? "editor" : "api";
        }

        return {
          id: doc.id,
          template_id: doc.template_id,
          template_name: doc.templates?.name ?? "Unknown Template",
          status: doc.status,
          source,
          generated_by: profilesMap[doc.generated_by] ?? doc.generated_by ?? "System",
          created_at: doc.created_at,
          file_url: doc.file_url,
        };
      });
    },
  });

  // Filter documents
  const filteredDocuments = useMemo(() => {
    if (!documents.data) return [];
    return documents.data.filter((doc) => {
      // Search filter
      if (
        debouncedSearch &&
        !doc.template_name.toLowerCase().includes(debouncedSearch.toLowerCase())
      ) {
        return false;
      }
      // Status filter
      if (statusFilter !== "all" && doc.status !== statusFilter) {
        return false;
      }
      // Source filter
      if (sourceFilter !== "all" && doc.source !== sourceFilter) {
        return false;
      }
      // Template filter
      if (templateFilter !== "all" && doc.template_id !== templateFilter) {
        return false;
      }
      // Date range filter
      if (dateFrom && new Date(doc.created_at) < new Date(dateFrom)) {
        return false;
      }
      if (dateTo && new Date(doc.created_at) > new Date(dateTo)) {
        return false;
      }
      return true;
    });
  }, [
    documents.data,
    debouncedSearch,
    statusFilter,
    sourceFilter,
    templateFilter,
    dateFrom,
    dateTo,
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredDocuments.length / ITEMS_PER_PAGE);
  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDocuments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDocuments, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, templateFilter, dateFrom, dateTo]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setSourceFilter("all");
    setTemplateFilter("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const hasActiveFilters =
    debouncedSearch ||
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    templateFilter !== "all" ||
    dateFrom ||
    dateTo;

  const handleDownload = async (doc: DocumentRow) => {
    if (!doc.file_url) return;

    // If file_url is a storage path, create signed URL
    if (!doc.file_url.startsWith("http")) {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_url, 3600); // 1 hour expiry

      if (error) {
        console.error("Error creating signed URL:", error);
        return;
      }

      window.open(data.signedUrl, "_blank");
    } else {
      window.open(doc.file_url, "_blank");
    }
  };

  if (workspaceLoading || documents.isLoading) {
    return (
      <AppShell title="Document History">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!workspace) {
    return (
      <AppShell title="Document History">
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-6" />
          </span>
          <h2 className="text-display mt-5 text-lg font-semibold">No workspace found</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Please create or join a workspace to view documents.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Document History"
      description="View and download all generated documents in your workspace."
    >
      {/* Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by template name..."
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all"
                      ? "All statuses"
                      : status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source === "all"
                      ? "All sources"
                      : source.charAt(0).toUpperCase() + source.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {(templates.data ?? []).map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
              placeholder="From date"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
              placeholder="To date"
            />
          </div>

          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Documents Table */}
      {!documents.data || documents.data.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-6" />
          </span>
          <h2 className="text-display mt-5 text-lg font-semibold">No documents yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Generate documents from your templates to see them here.
          </p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Search className="size-6" />
          </span>
          <h2 className="text-display mt-5 text-lg font-semibold">
            No documents match your filters
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
        <>
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Generated By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.template_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          doc.status === "completed"
                            ? "default"
                            : doc.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {doc.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.generated_by ?? "System"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {doc.status === "completed" && doc.file_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc)}
                          className="gap-2"
                        >
                          <Download className="size-4" />
                          Download
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>

                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }

                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={cn(currentPage === totalPages && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}

          <div className="mt-2 text-center text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredDocuments.length)} of{" "}
            {filteredDocuments.length} documents
          </div>
        </>
      )}
    </AppShell>
  );
}
