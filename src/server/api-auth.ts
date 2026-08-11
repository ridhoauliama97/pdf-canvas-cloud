import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { validateApiKey } from "@/functions/api-keys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiAuthContext {
  authType: "api_key";
  companyId: string;
  scopes: string[];
  keyId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonUnauthorized(message = "Invalid or revoked API key"): Response {
  return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Request-level middleware (for API file routes via server.handlers)
// ---------------------------------------------------------------------------

/**
 * Validates API key from Authorization header (Bearer token).
 * Falls through to session auth if no API key is present.
 *
 * Use this middleware with API file routes:
 * ```ts
 * export const Route = createFileRoute('/api/v1/...')({
 *   server: { middleware: [apiAuthMiddleware], handlers: { GET: ... } }
 * })
 * ```
 */
export const apiAuthMiddleware = createMiddleware().server(async ({ next, request }) => {
  const authHeader = request?.headers?.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await validateApiKey(token);
    if (!result) {
      throw jsonUnauthorized();
    }
    return next({
      context: {
        authType: "api_key" as const,
        companyId: result.companyId,
        scopes: result.scopes,
        keyId: result.keyId,
      },
    });
  }

  // No API key — reject (API routes require Bearer token)
  throw jsonUnauthorized("API key authentication required");
});

// ---------------------------------------------------------------------------
// Function-level middleware (for createServerFn)
// ---------------------------------------------------------------------------

/**
 * Same validation logic as apiAuthMiddleware but compatible with
 * `createServerFn().middleware()`. Uses `getRequest()` to access the
 * incoming request since function middleware does not receive it directly.
 */
export const requireApiAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await validateApiKey(token);
    if (!result) {
      throw jsonUnauthorized();
    }
    return next({
      context: {
        authType: "api_key" as const,
        companyId: result.companyId,
        scopes: result.scopes,
        keyId: result.keyId,
      },
    });
  }

  // No API key — fall through with undefined context (callers must check)
  return next({ context: undefined as unknown as ApiAuthContext });
});
