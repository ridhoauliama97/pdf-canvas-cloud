import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  FileStack,
  History,
  LayoutTemplate,
  Layers,
  LogOut,
  Terminal,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/templates", label: "Templates", icon: LayoutTemplate, ready: true },
  { to: "/settings", label: "Workspace", icon: Building2, ready: true },
  { to: "/templates", label: "Document history", icon: History, ready: false },
  { to: "/templates", label: "Batches", icon: Layers, ready: false },
  { to: "/templates", label: "Developers", icon: Terminal, ready: false },
  { to: "/templates", label: "Usage & billing", icon: Wallet, ready: false },
] as const;

export function AppShell({
  children,
  title,
  description,
  actions,
  wide,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const { user, signOut } = useAuth();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileStack className="size-4" />
          </span>
          <span className="text-display text-sm font-semibold">Report Flow</span>
        </div>

        <div className="border-b border-sidebar-border px-4 py-4">
          <p className="text-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Workspace
          </p>
          <p className="mt-1.5 truncate text-sm font-medium">{workspace?.name ?? "—"}</p>
          {workspace && (
            <p className="text-mono mt-0.5 text-[11px] text-muted-foreground">{workspace.role}</p>
          )}
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) =>
            item.ready ? (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                  pathname.startsWith(item.to) && "bg-sidebar-accent font-medium text-primary",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
                title="Coming in a later milestone"
              >
                <item.icon className="size-4" />
                {item.label}
                <span className="text-mono ml-auto rounded border border-border px-1 text-[9px] tracking-wide uppercase">
                  soon
                </span>
              </span>
            ),
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <p className="truncate px-2 text-xs text-muted-foreground">{user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {(title || actions) && (
          <header className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h1 className="text-display text-xl font-semibold">{title}</h1>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </header>
        )}
        <div className={cn("px-5 py-6 sm:px-8", wide && "px-0 py-0 sm:px-0")}>{children}</div>
      </main>
    </div>
  );
}
