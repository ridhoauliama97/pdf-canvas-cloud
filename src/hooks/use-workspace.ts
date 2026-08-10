import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type MemberRole = "admin" | "editor" | "developer" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  brand_color: string;
  logo_url: string | null;
  default_font: string;
  role: MemberRole;
}

export function useWorkspaces() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await supabase
        .from("company_members")
        .select("role, companies(id, name, slug, industry, brand_color, logo_url, default_font)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((row) => row.companies)
        .map((row) => ({
          ...(row.companies as unknown as Omit<Workspace, "role">),
          role: row.role as MemberRole,
        }));
    },
  });
}

export function useWorkspace() {
  const query = useWorkspaces();
  const workspace = query.data?.[0] ?? null;
  return {
    workspace,
    workspaces: query.data ?? [],
    isLoading: query.isLoading,
    canEdit: workspace ? workspace.role === "admin" || workspace.role === "editor" : false,
    isAdmin: workspace?.role === "admin",
    refetch: query.refetch,
  };
}
