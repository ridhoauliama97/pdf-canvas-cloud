/**
 * In-memory rate limiting middleware for API routes.
 *
 * Uses a simple Map-based store with sliding window counter.
 * For production, consider Redis-backed rate limiting for distributed systems.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface PlanConfig {
  limit: number;
  windowMs: number;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Plan configurations
// ---------------------------------------------------------------------------

export const PLAN_LIMITS: Record<string, PlanConfig> = {
  free: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 requests/hour
  pro: { limit: 1000, windowMs: 60 * 60 * 1000 }, // 1000 requests/hour
  enterprise: { limit: 10000, windowMs: 60 * 60 * 1000 }, // 10000 requests/hour
};

// Default to free plan if unknown
const DEFAULT_PLAN = "free";

// ---------------------------------------------------------------------------
// Core rate limit check
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key.
 *
 * @param key - Unique identifier (e.g., companyId + route)
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns RateLimitResult with allowed status, remaining count, and reset time
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No entry or window expired — create new entry
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  // Window still active — increment counter
  entry.count += 1;

  if (entry.count > limit) {
    // Over limit — deny
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit };
  }

  // Under limit — allow
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt, limit };
}

/**
 * Get plan configuration by plan name.
 * Falls back to free plan if plan is unknown.
 */
export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_PLAN] ?? { limit: 100, windowMs: 3600000 };
}

// ---------------------------------------------------------------------------
// Middleware for API routes
// ---------------------------------------------------------------------------

/**
 * Rate limit middleware for TanStack Start API routes.
 *
 * Extracts company_id from context (set by apiAuthMiddleware) and checks
 * rate limits based on the company's plan.
 *
 * @param context - The request context containing companyId and plan info
 * @returns Response with 429 status if rate limited, null if allowed
 */
export function rateLimitMiddleware(context: {
  companyId?: string;
  plan?: string;
}): Response | null {
  const companyId = context.companyId;
  if (!companyId) {
    // No company context — skip rate limiting (auth middleware handles this)
    return null;
  }

  const plan = context.plan ?? DEFAULT_PLAN;
  const config = getPlanConfig(plan);

  // Create unique key: companyId + plan (allows different limits per plan)
  const key = `ratelimit:${companyId}:${plan}`;

  const result = checkRateLimit(key, config.limit, config.windowMs);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);

    return new Response(
      JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      },
    );
  }

  // Allowed — return null (no response, continue to handler)
  return null;
}

/**
 * Helper to add rate limit headers to successful responses.
 */
export function addRateLimitHeaders(response: Response, key: string, limit: number): Response {
  const entry = rateLimitStore.get(key);
  if (!entry) return response;

  const remaining = Math.max(0, limit - entry.count);
  const headers = new Headers(response.headers);

  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
