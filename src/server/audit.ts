/**
 * Audit logging utility for Report Flow.
 *
 * Provides a fire-and-forget `logAuditEvent` function that inserts
 * audit log entries into the database using the service-role client.
 *
 * Usage:
 *   import { logAuditEvent } from "@/server/audit";
 *   await logAuditEvent({ companyId, userId, action: "document.generate", ... });
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface AuditEventParams {
  /** The company that owns this audit log entry. */
  companyId: string;
  /** The user who performed the action (optional for system actions). */
  userId?: string;
  /** Action identifier, e.g. "document.generate", "api_key.create". */
  action: string;
  /** Resource type, e.g. "document", "api_key", "member". */
  resourceType: string;
  /** ID of the affected resource (optional). */
  resourceId?: string;
  /** Additional context data (serialized as JSONB). */
  details?: Record<string, unknown>;
  /** Client IP address (optional). */
  ipAddress?: string;
}

/**
 * Log an audit event to the audit_log table.
 *
 * This function is designed to be fire-and-forget — errors are logged
 * to console but never thrown, so audit logging never blocks the caller.
 *
 * Note: Uses type assertion because audit_log is not yet in generated types.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const { error } = await (supabaseAdmin.from("audit_log") as any).insert({
      company_id: params.companyId,
      user_id: params.userId ?? null,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      details: params.details ?? {},
      ip_address: params.ipAddress ?? null,
    });

    if (error) {
      console.error(`[Audit] Failed to log event "${params.action}":`, error.message);
    }
  } catch (err) {
    // Never throw — audit logging is best-effort
    console.error(
      `[Audit] Unexpected error logging "${params.action}":`,
      err instanceof Error ? err.message : err,
    );
  }
}
