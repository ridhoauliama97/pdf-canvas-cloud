import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  KeyRound,
  Shield,
  Terminal,
  Trash2,
  Check,
  Clock,
  Eye,
  EyeOff,
  Webhook,
  Send,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listApiKeys, createApiKey, revokeApiKey } from "@/functions/api-keys";
import { listWebhooks, createWebhook, deleteWebhook, testWebhook } from "@/functions/webhooks";

export const Route = createFileRoute("/_authenticated/developers")({
  head: () => ({
    meta: [
      { title: "Developers — Report Flow" },
      {
        name: "description",
        content:
          "Manage API keys, review API documentation, and integrate Report Flow into your applications.",
      },
    ],
  }),
  component: DevelopersPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface CreateApiKeyResult {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  key: string;
}

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

interface CreateWebhookResult {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  secret: string;
}

const API_BASE_URL = "https://gisxutozbghkzdlnktls.supabase.co/functions/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ---------------------------------------------------------------------------
// CopyBlock — shows a value with copy button
// ---------------------------------------------------------------------------

function CopyBlock({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <code className="text-mono flex-1 truncate rounded-md bg-surface-2 px-3 py-2 text-xs">
        {value}
      </code>
      <Button variant="outline" size="icon" className="shrink-0" onClick={handleCopy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CodeBlock — syntax-highlighted cURL example
// ---------------------------------------------------------------------------

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative">
      <pre className="text-mono overflow-x-auto rounded-lg border border-border bg-surface-2 p-4 text-xs leading-relaxed">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-7"
        onClick={handleCopy}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Key Dialog
// ---------------------------------------------------------------------------

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateApiKeyResult) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Record<string, boolean>>({
    read: true,
    generate: false,
  });

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; scopes: string[] }) => {
      return createApiKey({ data: input });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setName("");
      setScopes({ read: true, generate: false });
      onOpenChange(false);
      onCreated(result as CreateApiKeyResult);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create API key");
    },
  });

  const selectedScopes = Object.entries(scopes)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Create API Key
          </DialogTitle>
          <DialogDescription>
            Generate a new API key to authenticate requests to the Report Flow API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. production-backend"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Scopes</Label>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes["read"] === true}
                  onCheckedChange={(checked) =>
                    setScopes((s) => ({ ...s, read: Boolean(checked) }))
                  }
                />
                <span className="font-medium">read</span>
                <span className="text-muted-foreground">— List templates, fetch documents</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes["generate"] === true}
                  onCheckedChange={(checked) =>
                    setScopes((s) => ({ ...s, generate: Boolean(checked) }))
                  }
                />
                <span className="font-medium">generate</span>
                <span className="text-muted-foreground">— Create documents from templates</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) {
                toast.error("Please enter a name for the API key");
                return;
              }
              if (selectedScopes.length === 0) {
                toast.error("Select at least one scope");
                return;
              }
              createMutation.mutate({ name: name.trim(), scopes: selectedScopes });
            }}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Key Display Dialog — shown ONCE after creation
// ---------------------------------------------------------------------------

function KeyDisplayDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CreateApiKeyResult | null;
}) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-success" />
            API Key Created
          </DialogTitle>
          <DialogDescription>
            Copy this key now. You won't be able to see it again after closing this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="mb-2 text-xs text-muted-foreground">
              <Shield className="mr-1 inline size-3" />
              Your API key
            </p>
            <CopyBlock value={result.key} />
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              Name: <span className="font-medium text-foreground">{result.name}</span>
            </span>
            <span>
              Scopes:{" "}
              <span className="font-medium text-foreground">{result.scopes.join(", ")}</span>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>I've saved the key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Revoke Confirmation Dialog
// ---------------------------------------------------------------------------

function RevokeDialog({
  open,
  onOpenChange,
  target,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ApiKeyRow | null;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately invalidate <strong>{target?.name}</strong> ({target?.key_prefix}
            ...). Any application using this key will lose access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Revoking..." : "Revoke key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Create Webhook Dialog
// ---------------------------------------------------------------------------

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateWebhookResult) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Record<string, boolean>>({
    "batch.completed": true,
  });

  const createMutation = useMutation({
    mutationFn: async (input: { url: string; events: string[] }) => {
      return createWebhook({ data: input });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setUrl("");
      setEvents({ "batch.completed": true });
      onOpenChange(false);
      onCreated(result as CreateWebhookResult);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create webhook");
    },
  });

  const selectedEvents = Object.entries(events)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return str.startsWith("http://") || str.startsWith("https://");
    } catch {
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="size-4" />
            Create Webhook
          </DialogTitle>
          <DialogDescription>
            Add a new webhook endpoint to receive event notifications from Report Flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://your-server.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We'll send POST requests to this URL with event payloads.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={events["batch.completed"] === true}
                  onCheckedChange={(checked) =>
                    setEvents((s) => ({ ...s, "batch.completed": Boolean(checked) }))
                  }
                />
                <span className="font-medium">batch.completed</span>
                <span className="text-muted-foreground">— When a batch finishes processing</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!url.trim()) {
                toast.error("Please enter a webhook URL");
                return;
              }
              if (!isValidUrl(url.trim())) {
                toast.error("Please enter a valid URL starting with http:// or https://");
                return;
              }
              if (selectedEvents.length === 0) {
                toast.error("Select at least one event");
                return;
              }
              createMutation.mutate({ url: url.trim(), events: selectedEvents });
            }}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Webhook Secret Display Dialog — shown ONCE after creation
// ---------------------------------------------------------------------------

function WebhookSecretDisplayDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CreateWebhookResult | null;
}) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="size-4 text-success" />
            Webhook Created
          </DialogTitle>
          <DialogDescription>
            Copy this signing secret now. You won't be able to see it again after closing this
            dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="mb-2 text-xs text-muted-foreground">
              <Shield className="mr-1 inline size-3" />
              Your webhook signing secret
            </p>
            <CopyBlock value={result.secret} />
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="flex items-center gap-2 text-xs text-amber-500">
              <AlertTriangle className="size-3.5" />
              <span className="font-medium">Important:</span> Use this secret to verify webhook
              signatures. It will not be shown again.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              URL: <span className="font-medium text-foreground">{result.url}</span>
            </span>
            <span>
              Events:{" "}
              <span className="font-medium text-foreground">{result.events.join(", ")}</span>
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>I've saved the secret</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Webhook Confirmation Dialog
// ---------------------------------------------------------------------------

function DeleteWebhookDialog({
  open,
  onOpenChange,
  target,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: WebhookRow | null;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the webhook endpoint <strong>{target?.url}</strong>. Any
            application sending events to this URL will no longer receive notifications.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting..." : "Delete webhook"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Test Webhook Dialog
// ---------------------------------------------------------------------------

function TestWebhookDialog({
  open,
  onOpenChange,
  webhook,
  onTest,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: WebhookRow | null;
  onTest: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Send className="size-4" />
            Test Webhook
          </AlertDialogTitle>
          <AlertDialogDescription>
            Send a test payload to <strong>{webhook?.url}</strong> to verify your endpoint is
            configured correctly.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onTest} disabled={isPending}>
            {isPending ? "Sending..." : "Send test payload"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function DevelopersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyDisplayOpen, setKeyDisplayOpen] = useState(false);
  const [createdResult, setCreatedResult] = useState<CreateApiKeyResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  // --- Webhook state ---
  const [webhookCreateOpen, setWebhookCreateOpen] = useState(false);
  const [webhookSecretOpen, setWebhookSecretOpen] = useState(false);
  const [createdWebhookResult, setCreatedWebhookResult] = useState<CreateWebhookResult | null>(
    null,
  );
  const [deleteWebhookTarget, setDeleteWebhookTarget] = useState<WebhookRow | null>(null);
  const [testWebhookTarget, setTestWebhookTarget] = useState<WebhookRow | null>(null);

  // --- Fetch API Keys ---
  const keysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const result = await listApiKeys();
      return (result ?? []) as ApiKeyRow[];
    },
  });

  // --- Fetch Webhooks ---
  const webhooksQuery = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const result = await listWebhooks();
      return (result ?? []) as WebhookRow[];
    },
  });

  // --- Revoke mutation ---
  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      return revokeApiKey({ data: { keyId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
      setRevokeTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to revoke key");
    },
  });

  // --- Delete Webhook mutation ---
  const deleteWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      return deleteWebhook({ data: { webhookId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook deleted");
      setDeleteWebhookTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete webhook");
    },
  });

  // --- Test Webhook mutation ---
  const testWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      return testWebhook({ data: { webhookId } });
    },
    onSuccess: () => {
      toast.success("Test payload sent successfully");
      setTestWebhookTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send test payload");
    },
  });

  const handleKeyCreated = (result: CreateApiKeyResult) => {
    setCreatedResult(result);
    setKeyDisplayOpen(true);
  };

  const handleWebhookCreated = (result: CreateWebhookResult) => {
    setCreatedWebhookResult(result);
    setWebhookSecretOpen(true);
  };

  const keys = keysQuery.data ?? [];
  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);
  const webhooks = webhooksQuery.data ?? [];

  return (
    <AppShell
      title="Developers"
      description="Manage API keys and integrate with the Report Flow REST API."
      actions={
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <KeyRound className="size-3.5" />
          Create API Key
        </Button>
      }
    >
      <Tabs defaultValue="api-keys" className="space-y-6">
        <TabsList>
          <TabsTrigger value="api-keys" className="gap-1.5">
            <KeyRound className="size-3.5" />
            API Keys
            {activeKeys.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {activeKeys.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5">
            <Terminal className="size-3.5" />
            API Docs
          </TabsTrigger>
          <TabsTrigger value="mcp" className="gap-1.5">
            <Shield className="size-3.5" />
            MCP
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-1.5">
            <Webhook className="size-3.5" />
            Webhooks
            {webhooks.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {webhooks.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* API Keys Tab                                                     */}
        {/* ================================================================ */}
        <TabsContent value="api-keys" className="space-y-6">
          {/* Active Keys */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-display text-sm font-semibold">Active Keys</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              These keys can authenticate against the Report Flow API.
            </p>

            {keysQuery.isLoading ? (
              <div className="mt-4 h-24 animate-pulse rounded-lg bg-surface-2" />
            ) : activeKeys.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
                <KeyRound className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active API keys</p>
                <p className="text-xs text-muted-foreground/70">
                  Create one to start using the API
                </p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <code className="text-mono text-xs text-muted-foreground">
                            {key.key_prefix}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {key.scopes.map((scope) => (
                              <Badge key={scope} variant="secondary" className="text-[10px]">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {key.last_used_at ? (
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {timeSince(key.last_used_at)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <EyeOff className="size-3" />
                              Never
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(key.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRevokeTarget(key)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Revoked Keys */}
          {revokedKeys.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-display text-sm font-semibold">Revoked Keys</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                These keys are inactive and cannot be used for authentication.
              </p>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Revoked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revokedKeys.map((key) => (
                      <TableRow key={key.id} className="opacity-60">
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <code className="text-mono text-xs text-muted-foreground">
                            {key.key_prefix}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {key.scopes.map((scope) => (
                              <Badge key={scope} variant="secondary" className="text-[10px]">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {key.revoked_at && formatDate(key.revoked_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* API Documentation Tab                                            */}
        {/* ================================================================ */}
        <TabsContent value="docs" className="space-y-6">
          {/* Base URL */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-display text-sm font-semibold">Base URL</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              All API requests should be sent to the following base URL.
            </p>
            <div className="mt-3">
              <CopyBlock value={API_BASE_URL} />
            </div>
          </section>

          {/* Authentication */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-display text-sm font-semibold">Authentication</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Include your API key in the <code className="text-mono">Authorization</code> header as
              a Bearer token.
            </p>
            <div className="mt-3">
              <CodeBlock code={`Authorization: Bearer rf_...your-api-key`} />
            </div>
          </section>

          {/* Examples */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-display text-sm font-semibold">Example Requests</h2>
            <div className="mt-4 space-y-6">
              {/* List templates */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default" className="text-[10px]">
                    GET
                  </Badge>
                  <h3 className="text-sm font-medium">List Templates</h3>
                </div>
                <CodeBlock
                  code={`curl -H "Authorization: Bearer rf_...your-api-key" \\
  ${API_BASE_URL}/api/v1/templates`}
                />
              </div>

              {/* Generate document */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="text-[10px]">POST</Badge>
                  <h3 className="text-sm font-medium">Generate Document</h3>
                </div>
                <CodeBlock
                  code={`curl -X POST \\
  -H "Authorization: Bearer rf_...your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"templateId": "...", "data": {...}}' \\
  ${API_BASE_URL}/api/v1/documents/generate`}
                />
              </div>

              {/* Get document */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default" className="text-[10px]">
                    GET
                  </Badge>
                  <h3 className="text-sm font-medium">Get Document</h3>
                </div>
                <CodeBlock
                  code={`curl -H "Authorization: Bearer rf_...your-api-key" \\
  ${API_BASE_URL}/api/v1/documents/:id`}
                />
              </div>
            </div>
          </section>
        </TabsContent>

        {/* ================================================================ */}
        {/* MCP Tab (placeholder)                                            */}
        {/* ================================================================ */}
        <TabsContent value="mcp" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-4" />
                MCP Server
                <Badge variant="secondary" className="text-[10px] uppercase">
                  Coming Soon
                </Badge>
              </CardTitle>
              <CardDescription>
                The Model Context Protocol server will enable AI assistants and agents to interact
                directly with your Report Flow workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <Terminal className="mx-auto size-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  The MCP server is under development. It will provide:
                </p>
                <ul className="mx-auto mt-3 max-w-md space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center justify-center gap-2">
                    <Check className="size-3 text-success" />
                    Template listing and preview
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="size-3 text-success" />
                    Document generation via natural language
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="size-3 text-success" />
                    Document status tracking
                  </li>
                  <li className="flex items-center justify-center gap-2">
                    <Check className="size-3 text-success" />
                    Workspace and settings management
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Webhooks Tab                                                     */}
        {/* ================================================================ */}
        <TabsContent value="webhooks" className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-display text-sm font-semibold">Webhook Endpoints</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Receive real-time notifications when events occur in your workspace.
                </p>
              </div>
              <Button onClick={() => setWebhookCreateOpen(true)} className="gap-1.5">
                <Webhook className="size-3.5" />
                Add Webhook
              </Button>
            </div>

            {webhooksQuery.isLoading ? (
              <div className="mt-4 h-24 animate-pulse rounded-lg bg-surface-2" />
            ) : webhooks.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
                <Webhook className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No webhook endpoints configured</p>
                <p className="text-xs text-muted-foreground/70">
                  Add a webhook to start receiving event notifications
                </p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell>
                          <code className="text-mono text-xs text-muted-foreground">
                            {webhook.url}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {webhook.events.map((event) => (
                              <Badge key={event} variant="secondary" className="text-[10px]">
                                {event}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={webhook.active ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {webhook.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(webhook.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTestWebhookTarget(webhook)}
                              title="Send test payload"
                            >
                              <Send className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteWebhookTarget(webhook)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleKeyCreated}
      />
      <KeyDisplayDialog
        open={keyDisplayOpen}
        onOpenChange={setKeyDisplayOpen}
        result={createdResult}
      />
      <RevokeDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        target={revokeTarget}
        onConfirm={() => {
          if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
        }}
        isPending={revokeMutation.isPending}
      />
      {/* Webhook Dialogs */}
      <CreateWebhookDialog
        open={webhookCreateOpen}
        onOpenChange={setWebhookCreateOpen}
        onCreated={handleWebhookCreated}
      />
      <WebhookSecretDisplayDialog
        open={webhookSecretOpen}
        onOpenChange={setWebhookSecretOpen}
        result={createdWebhookResult}
      />
      <DeleteWebhookDialog
        open={!!deleteWebhookTarget}
        onOpenChange={(open) => !open && setDeleteWebhookTarget(null)}
        target={deleteWebhookTarget}
        onConfirm={() => {
          if (deleteWebhookTarget) deleteWebhookMutation.mutate(deleteWebhookTarget.id);
        }}
        isPending={deleteWebhookMutation.isPending}
      />
      <TestWebhookDialog
        open={!!testWebhookTarget}
        onOpenChange={(open) => !open && setTestWebhookTarget(null)}
        webhook={testWebhookTarget}
        onTest={() => {
          if (testWebhookTarget) testWebhookMutation.mutate(testWebhookTarget.id);
        }}
        isPending={testWebhookMutation.isPending}
      />
    </AppShell>
  );
}
