import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/server/audit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the authenticated user's company ID from the `company_members` table.
 * Throws if the user is not a member of any company.
 */
async function getUserCompanyId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve company: ${error.message}`);
  }
  if (!data) {
    throw new Error("User is not a member of any company");
  }

  return data.company_id;
}

/**
 * Check if the user has an admin role in their company.
 */
async function requireAdmin(userId: string): Promise<string> {
  const companyId = await getUserCompanyId(userId);

  const { data: roleCheck, error: roleError } = await supabaseAdmin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (roleError || roleCheck?.role !== "admin") {
    throw new Error("Only admins can perform this action");
  }

  return companyId;
}

// ---------------------------------------------------------------------------
// 1. Invite Member
// ---------------------------------------------------------------------------

/**
 * Send an invitation to join the company.
 *
 * - Only admins can invite new members.
 * - Checks that the email is not already a member.
 * - Generates a random UUID token and inserts into the invitations table.
 * - Returns the invitation link (in production, this would send an email).
 */
export const inviteMember = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { email: string; role: string }) => {
    const validRoles = ["admin", "editor", "developer", "viewer"];
    if (!validRoles.includes(input.role)) {
      throw new Error(`Invalid role: ${input.role}. Valid roles: ${validRoles.join(", ")}`);
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const companyId = await requireAdmin(context.userId);

    // Check if email is already a member
    // List users and find by email (supabase auth doesn't have direct email filter)
    const { data: invitedUsers } = await supabaseAdmin.auth.admin.listUsers();

    const invitedUser = invitedUsers?.users?.find((u) => u.email === data.email);

    if (invitedUser) {
      const { data: alreadyMember } = await supabaseAdmin
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", invitedUser.id)
        .maybeSingle();

      if (alreadyMember) {
        throw new Error("This user is already a member of the company");
      }
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabaseAdmin
      .from("invitations")
      .select("id")
      .eq("company_id", companyId)
      .eq("email", data.email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      throw new Error("An invitation is already pending for this email");
    }

    // Generate invitation token (random UUID)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .insert({
        company_id: companyId,
        email: data.email,
        role: data.role as "admin" | "editor" | "developer" | "viewer",
        token,
        status: "pending",
        invited_by: context.userId,
        expires_at: expiresAt,
      })
      .select("id, email, role, token, expires_at, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to create invitation: ${error.message}`);
    }

    // Log audit event (fire-and-forget)
    logAuditEvent({
      companyId,
      userId: context.userId,
      action: "member.invite",
      resourceType: "invitation",
      resourceId: invitation.id,
      details: {
        email: data.email,
        role: data.role,
      },
    });

    // Send invitation email
    const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : "https://reportflow.dev"}/invite?token=${token}`;

    // Get company name and inviter name
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single();

    const { data: inviterProfile } = await supabaseAdmin.auth.admin.getUserById(context.userId);

    const inviterName =
      ((inviterProfile?.user?.user_metadata as Record<string, unknown>)?.["full_name"] as string) ??
      "Someone";

    // Import and send email
    const { sendInvitationEmail } = await import("@/server/email");
    await sendInvitationEmail({
      to: data.email,
      companyName: company?.name ?? "your workspace",
      invitedByName: inviterName,
      inviteUrl,
      role: data.role,
    });

    return {
      invitation,
      invitationLink: `/auth/invite?token=${token}`,
    };
  });

// ---------------------------------------------------------------------------
// 2. List Members
// ---------------------------------------------------------------------------

/**
 * List all members of the company with their profile information.
 *
 * Returns members joined with profiles (name, email, avatar).
 */
export const listMembers = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { data, error } = await supabaseAdmin
      .from("company_members")
      .select("id, role, user_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list members: ${error.message}`);
    }

    // Fetch profiles for each member
    const membersWithProfiles = await Promise.all(
      (data ?? []).map(async (member) => {
        const { data: profileData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        const meta = (profileData?.user?.user_metadata ?? {}) as Record<string, unknown>;

        return {
          ...member,
          profile: {
            full_name: (meta["full_name"] as string) ?? null,
            email: profileData?.user?.email ?? null,
            avatar_url: (meta["avatar_url"] as string) ?? null,
          },
        };
      }),
    );

    return membersWithProfiles;
  });

// ---------------------------------------------------------------------------
// 3. Update Member Role
// ---------------------------------------------------------------------------

/**
 * Change a member's role within the company.
 *
 * - Only admins can change roles.
 * - Admins cannot change their own role.
 */
export const updateMemberRole = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; role: string }) => {
    const validRoles = ["admin", "editor", "developer", "viewer"];
    if (!validRoles.includes(input.role)) {
      throw new Error(`Invalid role: ${input.role}. Valid roles: ${validRoles.join(", ")}`);
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const companyId = await requireAdmin(context.userId);

    // Cannot change own role
    if (data.userId === context.userId) {
      throw new Error("Cannot change your own role");
    }

    const { error } = await supabaseAdmin
      .from("company_members")
      .update({
        role: data.role as "admin" | "editor" | "developer" | "viewer" as
          "admin" | "editor" | "developer" | "viewer",
      })
      .eq("company_id", companyId)
      .eq("user_id", data.userId);

    if (error) {
      throw new Error(`Failed to update member role: ${error.message}`);
    }

    // Log audit event (fire-and-forget)
    logAuditEvent({
      companyId,
      userId: context.userId,
      action: "member.role_change",
      resourceType: "member",
      resourceId: data.userId,
      details: {
        new_role: data.role,
      },
    });

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 4. Remove Member
// ---------------------------------------------------------------------------

/**
 * Remove a member from the company.
 *
 * - Only admins can remove members.
 * - Admins cannot remove themselves.
 */
export const removeMember = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await requireAdmin(context.userId);

    // Cannot remove self
    if (data.userId === context.userId) {
      throw new Error("Cannot remove yourself from the company");
    }

    const { error } = await supabaseAdmin
      .from("company_members")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", data.userId);

    if (error) {
      throw new Error(`Failed to remove member: ${error.message}`);
    }

    // Log audit event (fire-and-forget)
    logAuditEvent({
      companyId,
      userId: context.userId,
      action: "member.remove",
      resourceType: "member",
      resourceId: data.userId,
    });

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 5. List Invitations
// ---------------------------------------------------------------------------

/**
 * List all pending invitations for the company.
 */
export const listInvitations = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { data, error } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list invitations: ${error.message}`);
    }

    return data;
  });

// ---------------------------------------------------------------------------
// 6. Cancel Invitation
// ---------------------------------------------------------------------------

/**
 * Cancel a pending invitation by setting its status to "cancelled".
 */
export const cancelInvitation = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { invitationId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await requireAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("invitations")
      .update({ status: "cancelled" })
      .eq("id", data.invitationId)
      .eq("company_id", companyId)
      .eq("status", "pending");

    if (error) {
      throw new Error(`Failed to cancel invitation: ${error.message}`);
    }

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 7. Update Workspace
// ---------------------------------------------------------------------------

/**
 * Update workspace (company) settings.
 *
 * - Only admins can update workspace settings.
 */
export const updateWorkspace = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { name?: string; industry?: string; brand_color?: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await requireAdmin(context.userId);

    const updateData: { name?: string; industry?: string; brand_color?: string } = {};
    if (data["name"] !== undefined) updateData["name"] = data["name"];
    if (data["industry"] !== undefined) updateData["industry"] = data["industry"];
    if (data["brand_color"] !== undefined) updateData["brand_color"] = data["brand_color"];

    if (Object.keys(updateData).length === 0) {
      throw new Error("No fields to update");
    }

    const { error } = await supabaseAdmin.from("companies").update(updateData).eq("id", companyId);

    if (error) {
      throw new Error(`Failed to update workspace: ${error.message}`);
    }

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 8. Update Profile
// ---------------------------------------------------------------------------

/**
 * Update the authenticated user's profile.
 *
 * - Users can only update their own profile.
 */
export const updateProfile = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { full_name?: string; avatar_url?: string }) => input)
  .handler(async ({ data, context }) => {
    const updateData: Record<string, string> = {};
    if (data["full_name"] !== undefined) updateData["full_name"] = data["full_name"];
    if (data["avatar_url"] !== undefined) updateData["avatar_url"] = data["avatar_url"];

    if (Object.keys(updateData).length === 0) {
      throw new Error("No fields to update");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: updateData,
    });

    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }

    return { success: true } as const;
  });
