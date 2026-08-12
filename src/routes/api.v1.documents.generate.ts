import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { apiAuthMiddleware } from "@/server/api-auth";
import { rateLimitMiddleware } from "@/server/rate-limit";
import {
  ApiError,
  jsonError,
  requireScope,
  handleGenerateDocument,
} from "@/server/api-routes.server";

export const Route = createFileRoute("/api/v1/documents/generate")({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
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

          requireScope(context.scopes, "generate");

          // Parse and validate request body
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(400, "VALIDATION_ERROR", "Invalid JSON body");
          }

          const { templateId, data } = body as {
            templateId?: string;
            data?: Record<string, unknown>;
          };

          if (!templateId || typeof templateId !== "string") {
            return jsonError(400, "VALIDATION_ERROR", "Missing or invalid templateId");
          }

          if (!data || typeof data !== "object") {
            return jsonError(400, "VALIDATION_ERROR", "Missing or invalid data field");
          }

          const result = await handleGenerateDocument(
            context.companyId,
            { templateId, data },
            context.keyId,
          );
          return json({ data: result });
        } catch (error) {
          if (error instanceof ApiError) {
            return jsonError(error.status, error.code, error.message);
          }
          console.error("[API] POST /api/v1/documents/generate error:", error);
          return jsonError(500, "INTERNAL", "An unexpected error occurred");
        }
      },
    },
  },
});
