import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/invite")({
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // Fetch invitation details
  const invitation = useQuery({
    queryKey: ["invitation", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, status, expires_at, company_id, companies(name)")
        .eq("token", token)
        .single();

      if (error || !data) {
        throw new Error("Invalid or expired invitation");
      }

      if (data.status !== "pending") {
        throw new Error("This invitation has already been used");
      }

      if (new Date(data.expires_at) < new Date()) {
        throw new Error("This invitation has expired");
      }

      return data;
    },
  });

  // Accept invitation mutation
  const acceptInvite = useMutation({
    mutationFn: async () => {
      if (!invitation.data) throw new Error("No invitation data");

      // Check if user is already signed in
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // User needs to sign in or sign up first
        if (isSignUp) {
          // Sign up new user
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName },
            },
          });
          if (signUpError) throw signUpError;
        } else {
          // Sign in existing user
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInError) throw signInError;
        }
      }

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Add user to company
      const { error: memberError } = await supabase.from("company_members").insert({
        company_id: invitation.data.company_id,
        user_id: user.id,
        role: invitation.data.role,
      });

      if (memberError) throw memberError;

      // Update invitation status
      await supabase
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", invitation.data.id);

      return invitation.data;
    },
    onSuccess: async (data) => {
      toast.success(`Welcome! You've joined ${data.companies?.name}`);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      navigate({ to: "/templates" });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
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
          <p className="mt-2 text-sm text-muted-foreground">
            {invitation.error.message || "This invitation is invalid or has expired."}
          </p>
          <Button className="mt-6" onClick={() => navigate({ to: "/auth" })}>
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  const companyName = invitation.data?.companies?.name ?? "the workspace";
  const role = invitation.data?.role ?? "viewer";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileStack className="size-5" />
          </span>
          <div>
            <h1 className="text-display text-xl font-semibold">Join {companyName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You've been invited as a <strong>{role}</strong>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-panel">
          {/* Show invitation info */}
          <div className="mb-4 rounded-lg bg-muted p-3 text-sm">
            <p className="text-muted-foreground">
              Invited to: <strong>{companyName}</strong>
            </p>
            <p className="text-muted-foreground">
              Email: <strong>{invitation.data?.email}</strong>
            </p>
            <p className="text-muted-foreground">
              Role: <strong>{role}</strong>
            </p>
          </div>

          {/* Check if user is already signed in */}
          <SignedInCheck invitation={invitation.data} onSuccess={() => acceptInvite.mutate()} />
        </div>
      </div>
    </div>
  );
}

function SignedInCheck({ invitation, onSuccess }: { invitation: any; onSuccess: () => void }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <Loader2 className="mx-auto size-5 animate-spin text-primary" />;
  }

  if (session) {
    // User is already signed in, auto-accept
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Signed in as <strong>{session.user.email}</strong>
        </p>
        <Button className="w-full" onClick={onSuccess}>
          Join {invitation?.companies?.name}
        </Button>
      </div>
    );
  }

  // User needs to sign in or sign up
  return <AuthForm invitation={invitation} onSuccess={onSuccess} />;
}

function AuthForm({ invitation, onSuccess }: { invitation: any; onSuccess: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.href,
          },
        });
        if (error) throw error;
        toast.success("Check your email for verification link");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
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
      <div className="text-center">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setIsSignUp(!isSignUp)}
        >
          {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
        </button>
      </div>

      {isSignUp && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
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
