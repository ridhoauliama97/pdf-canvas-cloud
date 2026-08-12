import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/server/audit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a key using SHA-256 via the Web Crypto API (Node 18+). */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a random API key: `rf_` prefix + 48 alphanumeric characters. */
function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `rf_${random}`;
}

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

// ---------------------------------------------------------------------------
// 1. Create API Key
// ---------------------------------------------------------------------------

/**
 * Generate a new API key for the authenticated user's company.
 *
 * - Generates `rf_` + 48 random alphanumeric characters.
 * - Stores only the SHA-256 hash and a short prefix in the database.
 * - Returns the full key **once** — it cannot be retrieved again.
 */
const VALID_SCOPES = ["read", "generate"];

export const createApiKey = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; scopes: string[] }) => {
    // Validate scopes against whitelist
    const invalidScopes = input.scopes.filter((s) => !VALID_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      throw new Error(
        `Invalid scopes: ${invalidScopes.join(", ")}. Valid scopes: ${VALID_SCOPES.join(", ")}`,
      );
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);

    // Only admins can create API keys
    const { data: roleCheck } = await supabaseAdmin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", context.userId)
      .single();

    if (roleCheck?.role !== "admin") {
      throw new Error("Only admins can create API keys");
    }

    const key = generateApiKey();
    const keyHash = await hashKey(key);
    // Prefix: rf_ + first 8 random chars (11 chars total)
    const keyPrefix = key.slice(0, 11);

    const { data: apiKey, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        company_id: companyId,
        name: data.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes: data.scopes,
      })
      .select("id, name, key_prefix, scopes, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }

    // Log audit event (fire-and-forget)
    logAuditEvent({
      companyId,
      userId: context.userId,
      action: "api_key.create",
      resourceType: "api_key",
      resourceId: apiKey.id,
      details: {
        name: data.name,
        scopes: data.scopes,
        key_prefix: apiKey.key_prefix,
      },
    });

    // Return the full key alongside metadata — shown to the user exactly once.
    return { ...apiKey, key };
  });

// ---------------------------------------------------------------------------
// 2. List API Keys
// ---------------------------------------------------------------------------

/**
 * List all API keys for the authenticated user's company.
 *
 * Returns only safe metadata — never exposes `key_hash` or the full key.
 */
export const listApiKeys = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, created_at, revoked_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list API keys: ${error.message}`);
    }

    return data;
  });

// ---------------------------------------------------------------------------
// 3. Revoke API Key
// ---------------------------------------------------------------------------

/**
 * Soft-delete an API key by setting `revoked_at` to the current timestamp.
 * Only keys belonging to the authenticated user's company can be revoked.
 * Revoking an already-revoked key is a no-op (no error).
 */
export const revokeApiKey = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { keyId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.keyId)
      .eq("company_id", companyId)
      .is("revoked_at", null);

    if (error) {
      throw new Error(`Failed to revoke API key: ${error.message}`);
    }

    // Log audit event (fire-and-forget)
    logAuditEvent({
      companyId,
      userId: context.userId,
      action: "api_key.revoke",
      resourceType: "api_key",
      resourceId: data.keyId,
    });

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 4. Validate API Key
// ---------------------------------------------------------------------------

export interface ApiKeyValidation {
  companyId: string;
  scopes: string[];
  keyId: string;
}

/**
 * Validate a bearer token against stored API key hashes.
 *
 * - Hashes the incoming token with SHA-256 and looks up the matching row.
 * - Rejects revoked keys.
 * - Updates `last_used_at` on successful validation.
 * - Returns `null` for invalid or revoked keys.
 *
 * This function does **not** require user authentication middleware — it is
 * designed to be called from external-facing API routes.
 */
export async function validateApiKey(bearerToken: string): Promise<ApiKeyValidation | null> {
  const keyHash = await hashKey(bearerToken);

  const { data: apiKey, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, company_id, scopes")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !apiKey) {
    return null;
  }

  // Fire-and-forget: update last_used_at (ignore errors)
  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id);

  return {
    companyId: apiKey.company_id,
    scopes: apiKey.scopes,
    keyId: apiKey.id,
  };
}
