import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listMembers,
  listInvitations,
  inviteMember,
  cancelInvitation,
  updateMemberRole,
  removeMember,
  updateWorkspace,
  updateProfile,
} from "@/functions/team";
import { MoreHorizontal, UserPlus, Trash2, Shield, Mail, Building2, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace settings — Report Flow" },
      {
        name: "description",
        content: "Manage your Report Flow workspace, team members, and profile settings.",
      },
      { property: "og:title", content: "Workspace settings — Report Flow" },
      { property: "og:description", content: "Team management and workspace settings." },
    ],
  }),
  component: SettingsPage,
});

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "developer", label: "Developer" },
  { value: "viewer", label: "Viewer" },
];

function SettingsPage() {
  const { workspace, isAdmin, refetch: refetchWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  // Workspace settings state
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceIndustry, setWorkspaceIndustry] = useState("");
  const [workspaceBrandColor, setWorkspaceBrandColor] = useState("#3b82f6");

  // Profile settings state
  const [profileFullName, setProfileFullName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");

  // Initialize workspace form when data loads
  const [workspaceFormInitialized, setWorkspaceFormInitialized] = useState(false);
  const [profileFormInitialized, setProfileFormInitialized] = useState(false);

  // Members query
  const members = useQuery({
    queryKey: ["members", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const result = await listMembers();
      return result;
    },
  });

  // Invitations query
  const invitations = useQuery({
    queryKey: ["invitations", workspace?.id],
    enabled: Boolean(workspace?.id),
    queryFn: async () => {
      const result = await listInvitations();
      return result;
    },
  });

  // Initialize workspace form
  if (workspace && !workspaceFormInitialized) {
    setWorkspaceName(workspace.name);
    setWorkspaceIndustry(workspace.industry ?? "");
    setWorkspaceBrandColor(workspace.brand_color);
    setWorkspaceFormInitialized(true);
  }

  // Initialize profile form
  if (user && !profileFormInitialized) {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    setProfileFullName((meta["full_name"] as string) ?? "");
    setProfileAvatarUrl((meta["avatar_url"] as string) ?? "");
    setProfileFormInitialized(true);
  }

  // Invite member mutation
  const inviteMemberMutation = useMutation({
    mutationFn: async () => {
      return inviteMember({ data: { email: inviteEmail, role: inviteRole } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", workspace?.id] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
    },
  });

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return cancelInvitation({ data: { invitationId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations", workspace?.id] });
    },
  });

  // Update member role mutation
  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return updateMemberRole({ data: { userId, role } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", workspace?.id] });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return removeMember({ data: { userId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", workspace?.id] });
    },
  });

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: async () => {
      return updateWorkspace({
        data: {
          name: workspaceName,
          industry: workspaceIndustry,
          brand_color: workspaceBrandColor,
        },
      });
    },
    onSuccess: () => {
      refetchWorkspace();
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      return updateProfile({
        data: {
          full_name: profileFullName,
          avatar_url: profileAvatarUrl,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <AppShell
      title="Workspace"
      description="Manage your team, workspace settings, and profile."
      actions={
        isAdmin ? (
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="size-4" /> Invite member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite team member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join your workspace. They'll receive an email with a link to
                  sign up.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger id="invite-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setInviteDialogOpen(false)}
                  disabled={inviteMemberMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => inviteMemberMutation.mutate()}
                  disabled={!inviteEmail || inviteMemberMutation.isPending}
                >
                  {inviteMemberMutation.isPending ? "Sending..." : "Send invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Members Section */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-display text-sm font-semibold">Team Members</h2>
          {members.isLoading ? (
            <Skeleton className="mt-4 h-32" />
          ) : (
            <ul className="mt-4 space-y-3">
              {members.data?.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={member.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(member.profile.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.profile.full_name ?? "Unknown"}
                      </p>
                      <p className="text-mono truncate text-xs text-muted-foreground">
                        {member.profile.email ?? member.user_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{member.role}</Badge>
                    {isAdmin && member.user_id !== user?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              const newRole = window.prompt(
                                "Enter new role (admin, editor, developer, viewer):",
                                member.role,
                              );
                              if (newRole && newRole !== member.role) {
                                updateMemberRoleMutation.mutate({
                                  userId: member.user_id,
                                  role: newRole,
                                });
                              }
                            }}
                          >
                            <Shield className="size-4" /> Change role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <Trash2 className="size-4" /> Remove member
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove team member?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove{" "}
                                  {member.profile.full_name ?? member.profile.email} from the
                                  workspace. They will lose access to all resources.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => removeMemberMutation.mutate(member.user_id)}
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pending Invitations */}
          {invitations.data && invitations.data.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Pending Invitations
              </h3>
              <ul className="mt-3 space-y-2">
                {invitations.data.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                        <Mail className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm">{invitation.email}</p>
                        <p className="text-mono text-xs text-muted-foreground">
                          Invited {new Date(invitation.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{invitation.role}</Badge>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                          disabled={cancelInvitationMutation.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Workspace Settings Section */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-display flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4" /> Workspace Settings
          </h2>
          {isAdmin ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My Workspace"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-industry">Industry</Label>
                <Input
                  id="workspace-industry"
                  value={workspaceIndustry}
                  onChange={(e) => setWorkspaceIndustry(e.target.value)}
                  placeholder="Technology, Finance, etc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-brand-color">Brand color</Label>
                <div className="flex gap-2">
                  <Input
                    id="workspace-brand-color"
                    type="color"
                    value={workspaceBrandColor}
                    onChange={(e) => setWorkspaceBrandColor(e.target.value)}
                    className="h-9 w-16 cursor-pointer p-1"
                  />
                  <Input
                    value={workspaceBrandColor}
                    onChange={(e) => setWorkspaceBrandColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>
              <Button
                onClick={() => updateWorkspaceMutation.mutate()}
                disabled={updateWorkspaceMutation.isPending || !workspaceName}
              >
                {updateWorkspaceMutation.isPending ? "Saving..." : "Save workspace settings"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              <dl className="space-y-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd>{workspace?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Industry</dt>
                  <dd>{workspace?.industry ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Brand color</dt>
                  <dd className="flex items-center gap-2">
                    <span
                      className="inline-block size-4 rounded-full border border-border"
                      style={{ backgroundColor: workspace?.brand_color }}
                    />
                    {workspace?.brand_color}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Only admins can edit workspace settings.
              </p>
            </div>
          )}
        </section>

        {/* Profile Settings Section */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-display flex items-center gap-2 text-sm font-semibold">
            <User className="size-4" /> Profile Settings
          </h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="size-16">
                  <AvatarImage src={profileAvatarUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {getInitials(profileFullName)}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute -bottom-1 -right-1 flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-accent">
                  <Pencil className="size-3" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !workspace || !user) return;
                      const path = `${workspace.id}/avatars/${user.id}-${Date.now()}.${file.name.split(".").pop()}`;
                      const { data: uploadData } = await supabase.storage
                        .from("reportflow-bucket")
                        .upload(path, file, { upsert: true });
                      if (uploadData) {
                        const { data: urlData } = await supabase.storage
                          .from("reportflow-bucket")
                          .createSignedUrl(path, 365 * 24 * 60 * 60);
                        if (urlData) setProfileAvatarUrl(urlData.signedUrl);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="flex-1 space-y-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-full-name">Full name</Label>
                  <Input
                    id="profile-full-name"
                    value={profileFullName}
                    onChange={(e) => setProfileFullName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </div>
            </div>
            <Button
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
