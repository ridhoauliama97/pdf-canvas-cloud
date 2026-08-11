import { Resend } from "resend";

const resendApiKey = process.env["RESEND_API_KEY"];
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendInvitationEmailParams {
  to: string;
  companyName: string;
  invitedByName: string;
  inviteUrl: string;
  role: string;
}

export async function sendInvitationEmail({
  to,
  companyName,
  invitedByName,
  inviteUrl,
  role,
}: SendInvitationEmailParams): Promise<boolean> {
  // Skip email in development if no API key
  if (!resend) {
    console.log(`[Email] Invitation to ${to}: ${inviteUrl}`);
    return true;
  }

  try {
    const fromEmail = process.env["RESEND_FROM_EMAIL"] || "noreply@reportflow.dev";

    await resend.emails.send({
      from: `Report Flow <${fromEmail}>`,
      to,
      subject: `You've been invited to join ${companyName} on Report Flow`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Report Flow</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Document templates as an API</p>
          </div>
          
          <div style="background: #f9fafb; border-radius: 12px; padding: 32px; margin-bottom: 32px;">
            <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">You're invited!</h2>
            <p style="margin: 0 0 16px 0; color: #6b7280;">
              <strong>${invitedByName}</strong> has invited you to join <strong>${companyName}</strong> on Report Flow as a <strong>${role}</strong>.
            </p>
            <p style="margin: 0 0 24px 0; color: #6b7280;">
              Click the button below to accept the invitation and create your account.
            </p>
            <div style="text-align: center;">
              <a href="${inviteUrl}" style="display: inline-block; background: #F59E0B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>
            <p style="margin: 24px 0 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
              If you don't want to join, you can ignore this email.
            </p>
          </div>
          
          <div style="text-align: center; color: #9ca3af; font-size: 12px;">
            <p style="margin: 0;">Report Flow — Document templates as an API</p>
          </div>
        </body>
        </html>
      `,
    });

    return true;
  } catch (error) {
    console.error("Failed to send invitation email:", error);
    return false;
  }
}
