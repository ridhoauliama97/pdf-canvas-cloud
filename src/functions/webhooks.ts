import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random webhook secret: `whsec_` prefix + 32 base64url characters. */
function generateWebhookSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `whsec_${random}`;
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
// 1. Create Webhook
// ---------------------------------------------------------------------------

const VALID_EVENTS = ["batch.completed"];

/**
 * Create a new webhook endpoint for the authenticated user's company.
 *
 * - Generates a signing secret (shown to the user exactly once).
 * - Returns the secret alongside webhook metadata.
 */
export const createWebhook = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string; events?: string[] }) => {
    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new Error("Invalid URL. Please provide a valid webhook endpoint URL.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Webhook URL must use HTTPS or HTTP protocol.");
    }

    // Validate events if provided
    const events = input.events ?? ["batch.completed"];
    const invalidEvents = events.filter((e) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      throw new Error(
        `Invalid events: ${invalidEvents.join(", ")}. Valid events: ${VALID_EVENTS.join(", ")}`,
      );
    }

    return { url: input.url, events };
  })
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);
    const secret = generateWebhookSecret();

    const { data: webhook, error } = await supabaseAdmin
      .from("webhooks")
      .insert({
        company_id: companyId,
        url: data.url,
        secret,
        events: data.events,
      })
      .select("id, url, events, active, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to create webhook: ${error.message}`);
    }

    // Return the secret alongside metadata — shown to the user exactly once.
    return { ...webhook, secret };
  });

// ---------------------------------------------------------------------------
// 2. List Webhooks
// ---------------------------------------------------------------------------

/**
 * List all webhooks for the authenticated user's company.
 *
 * Returns only safe metadata — never exposes the `secret`.
 */
export const listWebhooks = createServerFn({ method: "GET" as const })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { data, error } = await supabaseAdmin
      .from("webhooks")
      .select("id, url, events, active, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list webhooks: ${error.message}`);
    }

    return data;
  });

// ---------------------------------------------------------------------------
// 3. Delete Webhook
// ---------------------------------------------------------------------------

/**
 * Permanently delete a webhook by its ID.
 * Only webhooks belonging to the authenticated user's company can be deleted.
 */
export const deleteWebhook = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { webhookId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);

    const { error } = await supabaseAdmin
      .from("webhooks")
      .delete()
      .eq("id", data.webhookId)
      .eq("company_id", companyId);

    if (error) {
      throw new Error(`Failed to delete webhook: ${error.message}`);
    }

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 4. Test Webhook
// ---------------------------------------------------------------------------

/**
 * Send a test payload to a webhook endpoint.
 * The webhook must belong to the authenticated user's company.
 */
export const testWebhook = createServerFn({ method: "POST" as const })
  .middleware([requireSupabaseAuth])
  .validator((input: { webhookId: string }) => input)
  .handler(async ({ data, context }) => {
    const companyId = await getUserCompanyId(context.userId);

    // Fetch the webhook to get the URL and secret
    const { data: webhook, error: fetchError } = await supabaseAdmin
      .from("webhooks")
      .select("id, url, secret")
      .eq("id", data.webhookId)
      .eq("company_id", companyId)
      .single();

    if (fetchError || !webhook) {
      throw new Error("Webhook not found");
    }

    // Send a test payload
    const testPayload = {
      event: "webhook.test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook delivery from Report Flow.",
      },
    };

    const success = await deliverWebhook(webhook.url, webhook.secret, "webhook.test", testPayload);

    if (!success) {
      throw new Error("Test webhook failed after retries");
    }

    return { success: true } as const;
  });

// ---------------------------------------------------------------------------
// 5. Webhook Delivery — HMAC Signing + Retry Logic
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Compute an HMAC-SHA256 signature for a payload using the Web Crypto API.
 * Returns the signature as a lowercase hex string.
 */
async function computeSignature(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Deliver a webhook payload to the given URL with HMAC-SHA256 signing.
 *
 * - Signs the payload with `secret` and sends the hex signature in `X-Webhook-Signature`.
 * - Sends `X-Webhook-Timestamp` with the ISO timestamp.
 * - Retries up to 3 times with exponential backoff (1s, 4s, 16s).
 * - Returns `true` on success, `false` if all retries fail.
 * - Never throws — failures are logged and swallowed.
 */
async function deliverWebhook(
  webhookUrl: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify(payload);
  const signature = await computeSignature(secret, body);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": timestamp,
          "X-Report-Flow-Event": event,
        },
        body,
        signal: AbortSignal.timeout(30_000), // 30s timeout per attempt
      });

      if (response.ok) {
        console.log(`[Webhook] Delivered ${event} to ${webhookUrl} (attempt ${attempt})`);
        return true;
      }

      console.warn(
        `[Webhook] Delivery to ${webhookUrl} returned ${response.status} (attempt ${attempt}/${MAX_RETRIES})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn(
        `[Webhook] Delivery to ${webhookUrl} failed: ${message} (attempt ${attempt}/${MAX_RETRIES})`,
      );
    }

    // Exponential backoff before retry (skip wait on last attempt)
    if (attempt < MAX_RETRIES) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(4, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  console.error(`[Webhook] All ${MAX_RETRIES} delivery attempts failed for ${webhookUrl}`);
  return false;
}

// ---------------------------------------------------------------------------
// 6. notifyBatchComplete — Called when a batch finishes processing
// ---------------------------------------------------------------------------

/**
 * Notify all active webhooks for a company about a batch completion.
 *
 * Fetches active webhooks subscribed to the `batch.completed` event,
 * then fires `deliverWebhook` for each one. Delivery is non-blocking —
 * failures are logged but never throw.
 */
export async function notifyBatchComplete(batchId: string, companyId: string): Promise<void> {
  // Fetch the batch record for the payload
  const { data: batch, error: batchError } = await (supabaseAdmin.from("batches") as any)
    .select("id, status, total_count, processed_count, failed_count, created_at")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .single();

  if (batchError || !batch) {
    console.error(
      `[Webhook] Failed to fetch batch ${batchId} for notification: ${batchError?.message ?? "Not found"}`,
    );
    return;
  }

  // Fetch all active webhooks subscribed to batch.completed
  const { data: webhooks, error: webhookError } = await supabaseAdmin
    .from("webhooks")
    .select("id, url, secret")
    .eq("company_id", companyId)
    .eq("active", true)
    .contains("events", ["batch.completed"]);

  if (webhookError) {
    console.error(
      `[Webhook] Failed to fetch webhooks for company ${companyId}: ${webhookError.message}`,
    );
    return;
  }

  if (!webhooks || webhooks.length === 0) {
    return; // No webhooks to notify
  }

  const payload = {
    event: "batch.completed" as const,
    timestamp: new Date().toISOString(),
    data: {
      batch_id: batch.id,
      status: batch.status,
      total_count: batch.total_count,
      processed_count: batch.processed_count,
      failed_count: batch.failed_count,
      created_at: batch.created_at,
      completed_at: new Date().toISOString(),
    },
  };

  // Fire all webhook deliveries concurrently (non-blocking)
  const deliveries = webhooks.map((wh) =>
    deliverWebhook(wh.url, wh.secret, "batch.completed", payload),
  );

  // Await all — we intentionally swallow errors here
  await Promise.allSettled(deliveries);
}
