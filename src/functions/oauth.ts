import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthClient {
  id: string;
  company_id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  scopes: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OAuthToken {
  id: string;
  client_id: string;
  user_id: string;
  company_id: string;
  scopes: string[];
  expires_at: string;
  created_at: string;
}

export interface TokenExchangeResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  scopes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a string using SHA-256 via the Web Crypto API. */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a random OAuth client ID: `rf_client_` prefix + 32 alphanumeric chars. */
function generateClientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `rf_client_${random}`;
}

/** Generate a random OAuth client secret: `rf_secret_` prefix + 48 alphanumeric chars. */
function generateClientSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `rf_secret_${random}`;
}

/** Generate a random access token: `rf_token_` prefix + 48 alphanumeric chars. */
function generateAccessToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `rf_token_${random}`;
}

/** Generate a random refresh token: `rf_refresh_` prefix + 48 alphanumeric chars. */
function generateRefreshToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `rf_refresh_${random}`;
}

/**
 * Resolve the authenticated user's company ID from company_members.
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
 * Verify the user is an admin of the specified company.
 */
async function requireAdmin(userId: string, companyId: string): Promise<void> {
  const { data: roleCheck } = await supabaseAdmin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();

  if (roleCheck?.role !== "admin") {
    throw new Error("Only admins can manage OAuth clients");
  }
}

// ---------------------------------------------------------------------------
// 1. Create OAuth Client
// ---------------------------------------------------------------------------

const VALID_SCOPES = ["read", "generate"];

/**
 * Create a new OAuth client for the authenticated user's company.
 *
 * - Generates a unique client_id and client_secret.
 * - Stores only the SHA-256 hash of the client_secret.
 * - Returns client credentials ONCE — the secret cannot be retrieved again.
 */
export const createOAuthClient = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; redirect_uris?: string[]; scopes?: string[] }) => {
    // Validate scopes against whitelist if provided
    if (input.scopes) {
      const invalidScopes = input.scopes.filter((s) => !VALID_SCOPES.includes(s));
      if (invalidScopes.length > 0) {
        throw new Error(
          `Invalid scopes: ${invalidScopes.join(", ")}. Valid scopes: ${VALID_SCOPES.join(", ")}`,
        );
      }
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);
    await requireAdmin(context.userId, companyId);

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();
    const clientSecretHash = await hashToken(clientSecret);

    const { data: client, error } = await supabaseAdmin
      .from("oauth_clients")
      .insert({
        company_id: companyId,
        name: data.name,
        client_id: clientId,
        client_secret_hash: clientSecretHash,
        redirect_uris: data.redirect_uris || [],
        scopes: data.scopes || ["read", "generate"],
      })
      .select("id, name, client_id, redirect_uris, scopes, active, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to create OAuth client: ${error.message}`);
    }

    // Return client metadata alongside the secret — shown to the user exactly once.
    return {
      ...client,
      client_secret: clientSecret,
    };
  });

// ---------------------------------------------------------------------------
// 2. List OAuth Clients
// ---------------------------------------------------------------------------

/**
 * List all OAuth clients for the authenticated user's company.
 *
 * Returns only safe metadata — never exposes client_secret_hash.
 */
export const listOAuthClients = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { data, error } = await supabaseAdmin
      .from("oauth_clients")
      .select("id, name, client_id, redirect_uris, scopes, active, created_at, updated_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list OAuth clients: ${error.message}`);
    }

    return data;
  });

// ---------------------------------------------------------------------------
// 3. Delete OAuth Client
// ---------------------------------------------------------------------------

/**
 * Soft-delete an OAuth client by setting active to false.
 * Only clients belonging to the authenticated user's company can be deleted.
 * Deleting an already inactive client is a no-op (no error).
 */
export const deleteOAuthClient = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { clientId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);
    await requireAdmin(context.userId, companyId);

    const { error } = await supabaseAdmin
      .from("oauth_clients")
      .update({ active: false })
      .eq("id", data.clientId)
      .eq("company_id", companyId)
      .eq("active", true);

    if (error) {
      throw new Error(`Failed to delete OAuth client: ${error.message}`);
    }

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 4. Exchange Token (Client Credentials Grant)
// ---------------------------------------------------------------------------

export interface TokenExchangeRequest {
  client_id: string;
  client_secret: string;
  scopes?: string[];
}

/**
 * Exchange client credentials for an access token (Client Credentials Grant).
 *
 * - Validates client_id and client_secret against stored hash.
 * - Creates a new access token with the requested scopes.
 * - Returns access_token, token_type, expires_in, and scopes.
 *
 * This function does NOT require user authentication middleware — it is
 * designed to be called from the token endpoint.
 */
export async function exchangeToken(request: TokenExchangeRequest): Promise<TokenExchangeResult> {
  // Look up the client by client_id
  const { data: client, error: clientError } = await supabaseAdmin
    .from("oauth_clients")
    .select("client_id, client_secret_hash, scopes, active, company_id")
    .eq("client_id", request.client_id)
    .eq("active", true)
    .maybeSingle();

  if (clientError || !client) {
    throw new Error("Invalid client credentials");
  }

  // Verify the client secret
  const secretHash = await hashToken(request.client_secret);
  if (secretHash !== client.client_secret_hash) {
    throw new Error("Invalid client credentials");
  }

  // Validate requested scopes against allowed scopes
  const requestedScopes = request.scopes || client.scopes;
  const invalidScopes = requestedScopes.filter((s) => !client.scopes.includes(s));
  if (invalidScopes.length > 0) {
    throw new Error(
      `Invalid scopes: ${invalidScopes.join(", ")}. Allowed scopes: ${client.scopes.join(", ")}`,
    );
  }

  // Generate access token
  const accessToken = generateAccessToken();
  const accessTokenHash = await hashToken(accessToken);

  // Token expires in 1 hour
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // For client credentials, we need a user_id. We'll use a service account or
  // the company admin. For now, we'll use a placeholder that indicates this is
  // a client credentials token. In production, you might want to create a
  // dedicated service account user.
  const { data: adminMember } = await supabaseAdmin
    .from("company_members")
    .select("user_id")
    .eq("company_id", client.company_id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!adminMember) {
    throw new Error("No admin found for company");
  }

  // Store the token
  const { error: insertError } = await supabaseAdmin.from("oauth_tokens").insert({
    client_id: client.client_id,
    user_id: adminMember.user_id,
    company_id: client.company_id,
    access_token_hash: accessTokenHash,
    scopes: requestedScopes,
    expires_at: expiresAt,
  });

  if (insertError) {
    throw new Error(`Failed to create token: ${insertError.message}`);
  }

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scopes: requestedScopes,
  };
}

// ---------------------------------------------------------------------------
// 5. Refresh Token
// ---------------------------------------------------------------------------

export interface TokenRefreshRequest {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * Refresh an access token using a refresh token.
 *
 * - Validates client credentials and refresh token.
 * - Creates a new access token with the same scopes.
 * - Returns new access_token, token_type, expires_in, and scopes.
 */
export async function refreshToken(request: TokenRefreshRequest): Promise<TokenExchangeResult> {
  // Look up the client by client_id
  const { data: client, error: clientError } = await supabaseAdmin
    .from("oauth_clients")
    .select("client_id, client_secret_hash, active, company_id")
    .eq("client_id", request.client_id)
    .eq("active", true)
    .maybeSingle();

  if (clientError || !client) {
    throw new Error("Invalid client credentials");
  }

  // Verify the client secret
  const secretHash = await hashToken(request.client_secret);
  if (secretHash !== client.client_secret_hash) {
    throw new Error("Invalid client credentials");
  }

  // Hash the refresh token and look it up
  const refreshTokenHash = await hashToken(request.refresh_token);
  const { data: existingToken, error: tokenError } = await supabaseAdmin
    .from("oauth_tokens")
    .select("id, scopes, user_id, company_id")
    .eq("client_id", client.client_id)
    .eq("refresh_token_hash", refreshTokenHash)
    .maybeSingle();

  if (tokenError || !existingToken) {
    throw new Error("Invalid refresh token");
  }

  // Generate new access token
  const accessToken = generateAccessToken();
  const accessTokenHash = await hashToken(accessToken);

  // Token expires in 1 hour
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // Store the new token
  const { error: insertError } = await supabaseAdmin.from("oauth_tokens").insert({
    client_id: client.client_id,
    user_id: existingToken.user_id,
    company_id: existingToken.company_id,
    access_token_hash: accessTokenHash,
    scopes: existingToken.scopes,
    expires_at: expiresAt,
  });

  if (insertError) {
    throw new Error(`Failed to create token: ${insertError.message}`);
  }

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scopes: existingToken.scopes,
  };
}

// ---------------------------------------------------------------------------
// 6. Revoke Token
// ---------------------------------------------------------------------------

/**
 * Revoke an access token.
 *
 * - Deletes the token from the database.
 * - Revoking an already-revoked token is a no-op (no error).
 */
export async function revokeToken(accessToken: string): Promise<boolean> {
  const tokenHash = await hashToken(accessToken);

  const { error } = await supabaseAdmin
    .from("oauth_tokens")
    .delete()
    .eq("access_token_hash", tokenHash);

  if (error) {
    throw new Error(`Failed to revoke token: ${error.message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// 7. Validate OAuth Token (for API routes)
// ---------------------------------------------------------------------------

export interface OAuthTokenValidation {
  companyId: string;
  userId: string;
  scopes: string[];
  clientId: string;
}

/**
 * Validate an OAuth bearer token against stored token hashes.
 *
 * - Hashes the incoming token with SHA-256 and looks up the matching row.
 * - Rejects expired tokens.
 * - Returns null for invalid or expired tokens.
 *
 * This function does NOT require user authentication middleware — it is
 * designed to be called from external-facing API routes.
 */
export async function validateOAuthToken(
  bearerToken: string,
): Promise<OAuthTokenValidation | null> {
  const tokenHash = await hashToken(bearerToken);

  const { data: token, error } = await supabaseAdmin
    .from("oauth_tokens")
    .select("client_id, user_id, company_id, scopes, expires_at")
    .eq("access_token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !token) {
    return null;
  }

  return {
    companyId: token.company_id,
    userId: token.user_id,
    scopes: token.scopes,
    clientId: token.client_id,
  };
}

// ---------------------------------------------------------------------------
// 8. Introspect Token
// ---------------------------------------------------------------------------

export interface TokenIntrospection {
  active: boolean;
  scope?: string;
  client_id?: string;
  user_id?: string;
  company_id?: string;
  exp?: number;
  iat?: number;
  token_type?: string;
}

/**
 * Introspect an OAuth token to get metadata.
 *
 * - Returns token metadata if the token is valid and active.
 * - Returns { active: false } for invalid or expired tokens.
 *
 * This function follows RFC 7662 Token Introspection.
 */
export async function introspectToken(accessToken: string): Promise<TokenIntrospection> {
  const tokenHash = await hashToken(accessToken);

  const { data: token, error } = await supabaseAdmin
    .from("oauth_tokens")
    .select("client_id, user_id, company_id, scopes, expires_at, created_at")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (error || !token) {
    return { active: false };
  }

  // Check if token is expired
  const isExpired = new Date(token.expires_at) <= new Date();
  if (isExpired) {
    return { active: false };
  }

  return {
    active: true,
    scope: token.scopes.join(" "),
    client_id: token.client_id,
    user_id: token.user_id,
    company_id: token.company_id,
    exp: Math.floor(new Date(token.expires_at).getTime() / 1000),
    iat: Math.floor(new Date(token.created_at).getTime() / 1000),
    token_type: "Bearer",
  };
}
