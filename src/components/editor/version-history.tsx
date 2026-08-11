import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface TemplateVersion {
  id: string;
  version: number;
  created_at: string;
  note: string | null;
}

interface VersionHistoryProps {
  templateId: string;
  currentVersionId: string | null;
  canEdit: boolean;
  onRollback?: () => void;
}

/**
 * Version history panel — lists past template versions and allows rollback.
 *
 * Fetches versions from the `template_versions` table, displays them
 * in reverse chronological order, and provides a rollback button that
 * sets the template's `current_version_id`.
 */
export function VersionHistory({
  templateId,
  currentVersionId,
  canEdit,
  onRollback,
}: VersionHistoryProps) {
  const queryClient = useQueryClient();

  const versions = useQuery({
    queryKey: ["template-versions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_versions")
        .select("id, version, created_at, note")
        .eq("template_id", templateId)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateVersion[];
    },
  });

  const rollback = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase
        .from("templates")
        .update({ current_version_id: versionId })
        .eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      toast.success("Rolled back to selected version");
      onRollback?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (versions.isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = versions.data ?? [];

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No versions saved yet.</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((version) => {
        const isCurrent = version.id === currentVersionId;
        return (
          <div
            key={version.id}
            className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-surface-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-mono font-medium">v{version.version}</span>
                {isCurrent && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    current
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(version.created_at).toLocaleString()}
                {version.note && ` — ${version.note}`}
              </p>
            </div>
            {canEdit && !isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => rollback.mutate(version.id)}
                disabled={rollback.isPending}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
