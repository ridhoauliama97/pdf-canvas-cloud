import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace settings — Report Flow" },
      {
        name: "description",
        content: "Review your Report Flow workspace details and the members who can edit templates.",
      },
      { property: "og:title", content: "Workspace settings — Report Flow" },
      { property: "og:description", content: "Workspace details and member roles." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { workspace } = useWorkspace();

  const members = useQuery({
    queryKey: ["members", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_members")
        .select("id, role, user_id, created_at")
        .eq("company_id", workspace!.id);
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="Workspace" description="Details and access for the current workspace.">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-display text-sm font-semibold">Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{workspace?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Your role</dt>
              <dd>
                <Badge variant="secondary">{workspace?.role ?? "—"}</Badge>
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-display text-sm font-semibold">Members</h2>
          {members.isLoading ? (
            <Skeleton className="mt-4 h-20" />
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {members.data?.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3">
                  <span className="text-mono truncate text-xs text-muted-foreground">
                    {member.user_id}
                  </span>
                  <Badge variant="secondary">{member.role}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Invitations arrive with the team-management milestone.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
