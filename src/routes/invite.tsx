import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: search["token"] as string,
  }),
  head: () => ({
    meta: [
      { title: "Accept Invitation — Report Flow" },
      {
        name: "description",
        content: "Accept your invitation to join a workspace on Report Flow.",
      },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invitation = useQuery({
    queryKey: ["invitation", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, status, expires_at, company_id, token, companies(name)")
        .eq("token", token)
        .single();

      if (error || !data) throw new Error("Invalid or expired invitation");
      if (data.status !== "pending") throw new Error("This invitation has already been used");
      if (new Date(data.expires_at) < new Date()) throw new Error("This invitation has expired");
      return data;
    },
  });

  const acceptInvite = useMutation({
    mutationFn: async () => {
      if (!invitation.data) throw new Error("No invitation data");
      const { acceptInvitation } = await import("@/functions/accept-invite");
      return acceptInvitation({ data: { token: invitation.data.token } });
    },
    onSuccess: async () => {
      toast.success("Welcome! You've joined the company");
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      navigate({ to: "/templates" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (invitation.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (invitation.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <XCircle className="mx-auto size-12 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Invalid Invitation</h1>
          <p className="mt-2 text-sm text-muted-foreground">{invitation.error.message}</p>
          <Button className="mt-6" onClick={() => navigate({ to: "/auth" })}>
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileStack className="size-5" />
          </span>
          <div>
            <h1 className="text-display text-xl font-semibold">
              Join {invitation.data?.companies?.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You've been invited as a <strong>{invitation.data?.role}</strong>
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-panel">
          <div className="mb-4 rounded-lg bg-muted p-3 text-sm">
            <p className="text-muted-foreground">
              Email: <strong>{invitation.data?.email}</strong>
            </p>
            <p className="text-muted-foreground">
              Role: <strong>{invitation.data?.role}</strong>
            </p>
          </div>
          <AuthForm email={invitation.data?.email ?? ""} onSuccess={() => acceptInvite.mutate()} />
        </div>
      </div>
    </div>
  );
}

function AuthForm({ email, onSuccess }: { email: string; onSuccess: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formEmail, setFormEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) onSuccess();
    });
  }, [onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: formEmail,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.href },
        });
        if (error) throw error;
        toast.success("Check your email for verification link");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: formEmail, password });
        if (error) throw error;
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button
        type="button"
        className="text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setIsSignUp(!isSignUp)}
      >
        {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
      </button>
      {isSignUp && (
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          required
          value={formEmail}
          onChange={(e) => setFormEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Password</Label>
        <Input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {isSignUp ? "Create account & join" : "Sign in & join"}
      </Button>
    </form>
  );
}
