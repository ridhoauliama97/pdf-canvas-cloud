import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { introspectToken } from "@/functions/oauth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({
      error: { code, message },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/v1/oauth/introspect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Parse request body
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(400, "INVALID_REQUEST", "Invalid JSON body");
          }

          const { token } = body as { token?: string };

          // Validate token field
          if (!token || typeof token !== "string") {
            return jsonError(400, "INVALID_REQUEST", "Missing or invalid token");
          }

          // Introspect the token
          const result = await introspectToken(token);

          return json(result);
        } catch (error) {
          console.error("[API] POST /api/v1/oauth/introspect error:", error);
          return jsonError(500, "SERVER_ERROR", "An unexpected error occurred");
        }
      },
    },
  },
});
