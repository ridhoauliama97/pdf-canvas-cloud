import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { apiAuthMiddleware } from "@/server/api-auth";
import { rateLimitMiddleware } from "@/server/rate-limit";
import { ApiError, jsonError, requireScope, handleGetDocument } from "@/server/api-routes.server";

export const Route = createFileRoute("/api/v1/documents/$documentId")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params, context }) => {
        try {
          if (!context?.authType) {
            return jsonError(401, "UNAUTHORIZED", "API key authentication required");
          }

          // Rate limit check
          const rateLimitResponse = rateLimitMiddleware({
            companyId: context.companyId,
            plan: "free", // Default plan, can be extended later
          });
          if (rateLimitResponse) {
            return rateLimitResponse;
          }

          requireScope(context.scopes, "read");

          const { documentId } = params;
          if (!documentId || typeof documentId !== "string") {
            return jsonError(400, "VALIDATION_ERROR", "Invalid document ID");
          }

          const document = await handleGetDocument(context.companyId, documentId);
          return json({ data: document });
        } catch (error) {
          if (error instanceof ApiError) {
            return jsonError(error.status, error.code, error.message);
          }
          console.error("[API] GET /api/v1/documents/$documentId error:", error);
          return jsonError(500, "INTERNAL", "An unexpected error occurred");
        }
      },
    },
  },
});
