import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — Report Flow" },
      {
        name: "description",
        content:
          "View the complete audit trail of actions performed in your Report Flow workspace.",
      },
      { property: "og:title", content: "Audit Log — Report Flow" },
      {
        property: "og:description",
        content: "View the complete audit trail of actions performed in your workspace.",
      },
    ],
  }),
  component: AuditLogPage,
});

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditLogRow {
  id: string;
  company_id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20;

const ACTION_OPTIONS = [
  "all",
  "document.generate",
  "batch.create",
  "batch.complete",
  "api_key.create",
  "api_key.revoke",
  "member.invite",
  "member.remove",
  "member.role_change",
  "oauth_client.create",
  "oauth_client.delete",
  "template.create",
  "template.publish",
] as const;

type ActionFilter = (typeof ACTION_OPTIONS)[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Human-readable label for action slugs. */
function formatAction(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Badge variant based on action category. */
function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action.startsWith("member.remove") || action.includes("revoke") || action.includes("delete"))
    return "destructive";
  if (action.startsWith("batch.")) return "secondary";
  if (action.startsWith("api_key.") || action.startsWith("oauth_client.")) return "outline";
  return "default";
}

/** Format details object into a short summary. */
function formatDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return "—";
  const entries = Object.entries(details)
    .slice(0, 3)
    .map(([k, v]) => {
      const key = k.replace(/_/g, " ");
      if (typeof v === "string") return `${key}: ${v}`;
      if (typeof v === "number") return `${key}: ${v}`;
      if (Array.isArray(v)) return `${key}: ${v.join(", ")}`;
      return `${key}: ${JSON.stringify(v)}`;
    });
  return entries.join(" · ");
}

// ── Component ────────────────────────────────────────────────────────────────

function AuditLogPage() {
  const { workspace } = useWorkspace();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const auditLogs = useQuery({
    queryKey: ["auditLogs", workspace?.id, page, actionFilter, startDate, endDate],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("id, action, resource_type, resource_id, details, created_at, user_id")
        .eq("company_id", workspace!.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      if (startDate) {
        query = query.gte("created_at", new Date(startDate).toISOString());
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch audit logs: ${error.message}`);
      }

      return (data ?? []) as AuditLogRow[];
    },
  });

  const logs = auditLogs.data ?? [];
  // Estimate total count based on page and results
  const totalCount =
    logs.length === ITEMS_PER_PAGE
      ? page * ITEMS_PER_PAGE + 1
      : (page - 1) * ITEMS_PER_PAGE + logs.length;
  const totalPages = logs.length === ITEMS_PER_PAGE ? page + 1 : Math.max(1, page);

  return (
    <AppShell title="Audit Log" description="View all actions performed in your workspace.">
      {/* Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Select
            value={actionFilter}
            onValueChange={(v) => {
              setActionFilter(v as ActionFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt === "all" ? "All actions" : formatAction(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              placeholder="Start date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-[160px]"
            />

            <Input
              type="date"
              placeholder="End date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-[160px]"
            />
          </div>
        </div>

        {(actionFilter !== "all" || startDate || endDate) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActionFilter("all");
              setStartDate("");
              setEndDate("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface">
        {auditLogs.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-64" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <ScrollText className="size-6" />
            </span>
            <h2 className="text-display mt-5 text-lg font-semibold">No audit log entries found</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Actions performed in your workspace will appear here.
            </p>
            {(actionFilter !== "all" || startDate || endDate) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-6"
                onClick={() => {
                  setActionFilter("all");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead className="w-[140px]">Action</TableHead>
                    <TableHead className="w-[120px]">Resource</TableHead>
                    <TableHead className="w-[120px]">User ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-mono text-xs">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionBadgeVariant(log.action)} className="text-xs">
                          {formatAction(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.resource_type}
                        {log.resource_id && (
                          <span className="text-mono ml-1 text-[10px]">
                            {log.resource_id.slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-mono text-[11px] text-muted-foreground">
                        {log.user_id ? `${log.user_id.slice(0, 8)}…` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                        {formatDetails(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant={actionBadgeVariant(log.action)} className="text-xs shrink-0">
                      {formatAction(log.action)}
                    </Badge>
                    <span className="text-mono text-[10px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{log.resource_type}</span>
                    {log.resource_id && (
                      <span className="text-mono text-[10px]">{log.resource_id.slice(0, 8)}…</span>
                    )}
                    {log.user_id && (
                      <span className="text-mono text-[10px]">
                        User: {log.user_id.slice(0, 8)}…
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-full truncate text-xs text-muted-foreground">
                    {formatDetails(log.details)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-mono text-xs text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} entries)
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={cn(page <= 1 && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum =
                  totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink onClick={() => setPage(pageNum)} isActive={pageNum === page}>
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </AppShell>
  );
}
