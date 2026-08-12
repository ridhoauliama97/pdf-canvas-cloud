import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Accept an invitation to join a company.
 *
 * Uses supabaseAdmin to bypass RLS (the invitee is not yet a member).
 * Verifies email ownership to prevent unauthorized acceptance.
 */
export const acceptInvitation = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    // 1. Fetch invitation by token
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role, status, expires_at, company_id")
      .eq("token", data.token)
      .single();

    if (inviteError || !invitation) {
      throw new Error("Invalid or expired invitation");
    }

    // 2. Validate invitation status
    if (invitation.status !== "pending") {
      throw new Error("This invitation has already been used");
    }

    // 3. Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      throw new Error("This invitation has expired");
    }

    // 4. Verify email ownership — the invitee must be the one accepting
    const {
      data: { user },
    } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (!user) {
      throw new Error("Not authenticated");
    }

    if (user.email !== invitation.email) {
      throw new Error("This invitation was sent to a different email address");
    }

    // 5. Check if already a member
    const { data: existingMember } = await supabaseAdmin
      .from("company_members")
      .select("id")
      .eq("company_id", invitation.company_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existingMember) {
      throw new Error("You are already a member of this company");
    }

    // 6. Add as member (bypasses RLS via supabaseAdmin)
    const { error: memberError } = await supabaseAdmin.from("company_members").insert({
      company_id: invitation.company_id,
      user_id: context.userId,
      role: invitation.role,
    });

    if (memberError) {
      throw new Error(`Failed to join company: ${memberError.message}`);
    }

    // 7. Mark invitation as accepted
    await supabaseAdmin
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id)
      .eq("status", "pending"); // Idempotent check

    return { success: true, companyId: invitation.company_id };
  });
