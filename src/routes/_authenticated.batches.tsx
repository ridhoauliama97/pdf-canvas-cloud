import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { createBatch, listBatches, getBatch, retryBatchItems } from "@/functions/batches";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/batches")({
  head: () => ({
    meta: [
      { title: "Batches — Report Flow" },
      {
        name: "description",
        content: "Generate documents in bulk with async batch processing.",
      },
      { property: "og:title", content: "Batches — Report Flow" },
      { property: "og:description", content: "Bulk document generation." },
    ],
  }),
  component: BatchesPage,
});

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ReactNode;
  }
> = {
  queued: { label: "Queued", variant: "secondary", icon: <Clock className="size-3" /> },
  processing: {
    label: "Processing",
    variant: "default",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  completed: { label: "Completed", variant: "outline", icon: <CheckCircle2 className="size-3" /> },
  completed_with_errors: {
    label: "Partial",
    variant: "secondary",
    icon: <AlertTriangle className="size-3" />,
  },
  failed: { label: "Failed", variant: "destructive", icon: <XCircle className="size-3" /> },
};

interface TemplateOption {
  id: string;
  name: string;
}

function NewBatchDialog() {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [jsonInput, setJsonInput] = useState(
    '[\n  {\n    "invoice": { "number": "INV-001", "total": 100000 }\n  }\n]',
  );
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();

  const templates = useQuery({
    queryKey: ["templates", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async (): Promise<TemplateOption[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TemplateOption[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      let items: { templateId: string; data: Record<string, unknown> }[];
      try {
        const parsed = JSON.parse(jsonInput);
        items = (Array.isArray(parsed) ? parsed : [parsed]).map(
          (data: Record<string, unknown>) => ({
            templateId,
            data,
          }),
        );
      } catch {
        throw new Error("Invalid JSON input");
      }
      const result = await createBatch({
        data: { name: `Batch ${new Date().toLocaleDateString()}`, items },
      });
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success(
        `Batch created: ${result.processedCount} processed, ${result.failedCount} failed`,
      );
      setOpen(false);
      setTemplateId("");
      setJsonInput('[\n  {\n    "invoice": { "number": "INV-001", "total": 100000 }\n  }\n]');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New batch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New batch</DialogTitle>
          <DialogDescription>
            Generate multiple documents at once. Add JSON data for each document.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a published template" />
              </SelectTrigger>
              <SelectContent>
                {(templates.data ?? []).map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data (JSON array)</Label>
            <Textarea
              className="font-mono text-xs"
              rows={8}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='[{"key": "value"}, ...]'
            />
            <p className="text-xs text-muted-foreground">
              Each object in the array becomes one generated document.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => create.mutate()}
            disabled={create.isPending || !templateId}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create batch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BatchesPage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const queryClient = useQueryClient();

  const batches = useQuery({
    queryKey: ["batches", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const result = await listBatches({ data: undefined });
      return result;
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  if (workspaceLoading || batches.isLoading) {
    return (
      <AppShell title="Batches">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Batches"
      description="Generate documents in bulk with async processing."
      actions={<NewBatchDialog />}
    >
      {!batches.data || batches.data.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-6" />
          </span>
          <h2 className="text-display mt-5 text-lg font-semibold">No batches yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Create a batch to generate multiple documents at once.
          </p>
          <div className="mt-6">
            <NewBatchDialog />
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden rounded-xl border border-border bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[200px]">Progress</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.data.map((batch: any) => {
                  const config = STATUS_CONFIG[batch["status"]] ?? STATUS_CONFIG["queued"];
                  const progress =
                    batch.total_count > 0
                      ? Math.round((batch.processed_count / batch.total_count) * 100)
                      : 0;

                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.name || "Unnamed batch"}</TableCell>
                      <TableCell>
                        <Badge variant={config?.variant ?? "secondary"} className="gap-1">
                          {config?.icon} {config?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {batch.processed_count}/{batch.total_count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(batch.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-3 md:hidden">
            {batches.data.map((batch: any) => {
              const config = STATUS_CONFIG[batch["status"]] ?? STATUS_CONFIG["queued"];
              const progress =
                batch.total_count > 0
                  ? Math.round((batch.processed_count / batch.total_count) * 100)
                  : 0;

              return (
                <div key={batch.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{batch.name || "Unnamed batch"}</p>
                    <Badge variant={config?.variant ?? "secondary"} className="gap-1 shrink-0">
                      {config?.icon} {config?.label}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {batch.processed_count}/{batch.total_count}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(batch.created_at).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
