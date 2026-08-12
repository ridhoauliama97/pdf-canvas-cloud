import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { exchangeToken } from "@/functions/oauth";

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

export const Route = createFileRoute("/api/v1/oauth/token")({
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

          const { grant_type, client_id, client_secret, scopes } = body as {
            grant_type?: string;
            client_id?: string;
            client_secret?: string;
            scopes?: string[];
          };

          // Validate grant_type
          if (grant_type !== "client_credentials") {
            return jsonError(
              400,
              "UNSUPPORTED_GRANT_TYPE",
              "Only client_credentials grant type is supported",
            );
          }

          // Validate required fields
          if (!client_id || typeof client_id !== "string") {
            return jsonError(400, "INVALID_REQUEST", "Missing or invalid client_id");
          }

          if (!client_secret || typeof client_secret !== "string") {
            return jsonError(400, "INVALID_REQUEST", "Missing or invalid client_secret");
          }

          // Exchange token
          const result = await exchangeToken({
            client_id,
            client_secret,
            scopes: scopes ?? ["read", "generate"],
          });

          return json(result);
        } catch (error) {
          if (error instanceof Error) {
            // Handle specific error types
            if (error.message.includes("Invalid client credentials")) {
              return jsonError(401, "INVALID_CLIENT", "Invalid client credentials");
            }
            if (error.message.includes("Invalid scopes")) {
              return jsonError(400, "INVALID_SCOPE", error.message);
            }
            console.error("[API] POST /api/v1/oauth/token error:", error);
            return jsonError(500, "SERVER_ERROR", "An unexpected error occurred");
          }
          console.error("[API] POST /api/v1/oauth/token error:", error);
          return jsonError(500, "SERVER_ERROR", "An unexpected error occurred");
        }
      },
    },
  },
});
