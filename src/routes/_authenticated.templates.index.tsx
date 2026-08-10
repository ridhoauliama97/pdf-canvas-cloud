import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { STARTERS, getStarter } from "@/lib/starter-templates";
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
import { cn } from "@/lib/utils";
import { jsonValue } from "@/lib/json";

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
          <DialogDescription>Start from a document type, then customise the layout.</DialogDescription>
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

function TemplatesPage() {
  const { workspace, isLoading, canEdit } = useWorkspace();

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

  return (
    <AppShell
      title="Templates"
      description="Design once, then render from the API. Published versions are the ones the API uses."
      actions={canEdit ? <NewTemplateDialog companyId={workspace.id} /> : undefined}
    >
      {templates.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (templates.data?.length ?? 0) === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.data?.map((template) => (
            <Link
              key={template.id}
              to="/templates/$templateId"
              params={{ templateId: template.id }}
              className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[15px] leading-snug font-semibold group-hover:text-primary">
                  {template.name}
                </h2>
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
                <span>{template.doc_type.replace("_", " ")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
