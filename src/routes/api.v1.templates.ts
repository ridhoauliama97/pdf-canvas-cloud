import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { apiAuthMiddleware } from "@/server/api-auth";
import { ApiError, jsonError, requireScope, handleListTemplates } from "@/server/api-routes.server";

export const Route = createFileRoute("/api/v1/templates")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ context }) => {
        try {
          if (!context?.authType) {
            return jsonError(401, "UNAUTHORIZED", "API key authentication required");
          }

          requireScope(context.scopes, "read");

          const templates = await handleListTemplates(context.companyId);
          return json({ data: templates });
        } catch (error) {
          if (error instanceof ApiError) {
            return jsonError(error.status, error.code, error.message);
          }
          console.error("[API] GET /api/v1/templates error:", error);
          return jsonError(500, "INTERNAL", "An unexpected error occurred");
        }
      },
    },
  },
});
