import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();

          console.log("[Webhook] Resend event:", {
            type: body.type,
            created_at: body.created_at,
            data: body.data,
          });

          switch (body.type) {
            case "email.sent":
              console.log(`[Email] Sent to ${body.data?.email}`);
              break;
            case "email.delivered":
              console.log(`[Email] Delivered to ${body.data?.email}`);
              break;
            case "email.opened":
              console.log(`[Email] Opened by ${body.data?.email}`);
              break;
            case "email.clicked":
              console.log(`[Email] Clicked by ${body.data?.email}`);
              break;
            case "email.bounced":
              console.log(`[Email] Bounced: ${body.data?.email} - ${body.data?.reason}`);
              break;
          }

          return json({ received: true });
        } catch (error) {
          console.error("[Webhook] Error:", error);
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
