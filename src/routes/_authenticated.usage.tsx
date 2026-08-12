import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileText, HardDrive, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/usage")({
  head: () => ({
    meta: [
      { title: "Usage & Billing — Report Flow" },
      {
        name: "description",
        content: "Monitor your workspace usage and billing information.",
      },
      { property: "og:title", content: "Usage & Billing — Report Flow" },
      { property: "og:description", content: "Monitor your workspace usage and billing." },
    ],
  }),
  component: UsagePage,
});

interface UsageData {
  period: string;
  documents_generated: number;
  storage_bytes: number;
}

// Plan limits (these would typically come from a config or API)
const PLAN_LIMITS = {
  documents_per_month: 1000,
  storage_mb: 500,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function UsagePage() {
  const { workspace, isLoading: workspaceLoading } = useWorkspace();

  // Fetch current usage
  const currentUsage = useQuery({
    queryKey: ["usage-current", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async (): Promise<UsageData | null> => {
      const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
      const { data, error } = await supabase
        .from("usage_counters")
        .select("*")
        .eq("company_id", workspace!.id)
        .eq("period", currentPeriod)
        .maybeSingle();
      if (error) throw error;
      return data as UsageData | null;
    },
  });

  // Fetch usage history (last 6 months)
  const usageHistory = useQuery({
    queryKey: ["usage-history", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async (): Promise<UsageData[]> => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase
        .from("usage_counters")
        .select("*")
        .eq("company_id", workspace!.id)
        .gte("period", sixMonthsAgo.toISOString().slice(0, 7))
        .order("period", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UsageData[];
    },
  });

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!usageHistory.data) return [];
    return usageHistory.data.map((item) => ({
      period: item.period,
      documents: item.documents_generated,
      storage_mb: Number(item.storage_bytes) / (1024 * 1024),
    }));
  }, [usageHistory.data]);

  // Calculate current period stats
  const currentPeriodStats = useMemo(() => {
    const usage = currentUsage.data;
    return {
      documents: usage?.documents_generated ?? 0,
      storage_mb: usage ? Number(usage.storage_bytes) / (1024 * 1024) : 0,
    };
  }, [currentUsage.data]);

  // Calculate usage percentages
  const documentUsagePercent = Math.min(
    100,
    (currentPeriodStats.documents / PLAN_LIMITS.documents_per_month) * 100,
  );
  const storageUsagePercent = Math.min(
    100,
    (currentPeriodStats.storage_mb / PLAN_LIMITS.storage_mb) * 100,
  );

  if (workspaceLoading || currentUsage.isLoading || usageHistory.isLoading) {
    return (
      <AppShell title="Usage & Billing">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (!workspace) {
    return (
      <AppShell title="Usage & Billing">
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-20 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <BarChart3 className="size-6" />
          </span>
          <h2 className="text-display mt-5 text-lg font-semibold">No workspace found</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Please create or join a workspace to view usage information.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Usage & Billing"
      description="Monitor your workspace usage and billing information."
    >
      <div className="space-y-6">
        {/* Current Usage Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents Generated</CardTitle>
              <FileText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currentPeriodStats.documents.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                of {PLAN_LIMITS.documents_per_month.toLocaleString()} limit per month
              </p>
              <Progress value={documentUsagePercent} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
              <HardDrive className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(currentPeriodStats.storage_mb * 1024 * 1024)}
              </div>
              <p className="text-xs text-muted-foreground">of {PLAN_LIMITS.storage_mb} MB limit</p>
              <Progress value={storageUsagePercent} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Usage Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4" />
              Usage Over Time
            </CardTitle>
            <CardDescription>
              Document generation and storage usage for the last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="mx-auto size-8" />
                  <p className="mt-2 text-sm">No usage data available yet</p>
                  <p className="text-xs">Generate documents to see your usage trends</p>
                </div>
              </div>
            ) : (
              <ChartContainer
                config={{
                  documents: {
                    label: "Documents",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-64"
              >
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.split("-")[1]}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.toString()}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="documents" fill="var(--color-documents)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Plan Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Limits</CardTitle>
            <CardDescription>Current plan usage and limits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Documents per Month</p>
                  <p className="text-sm text-muted-foreground">
                    {currentPeriodStats.documents.toLocaleString()} /{" "}
                    {PLAN_LIMITS.documents_per_month.toLocaleString()} used
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{Math.round(documentUsagePercent)}%</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Storage</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBytes(currentPeriodStats.storage_mb * 1024 * 1024)} /{" "}
                    {PLAN_LIMITS.storage_mb} MB used
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{Math.round(storageUsagePercent)}%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
