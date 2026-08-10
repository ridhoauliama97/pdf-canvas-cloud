import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Braces, FileStack, LayoutTemplate, Plug, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Report Flow — Design documents once, generate PDFs by API" },
      {
        name: "description",
        content:
          "Turn invoices, quotations and purchase orders into reusable templates with a visual editor, then generate PDFs from a REST API or MCP server.",
      },
      { property: "og:title", content: "Report Flow — Document templates as an API" },
      {
        property: "og:description",
        content:
          "Design paginated documents in a drag-and-drop editor, bind JSON data, and generate PDFs synchronously or in batches of thousands.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: LayoutTemplate,
    title: "Visual template editor",
    body: "Real A4 canvas, snapping guides, repeating tables that page-break, and conditional rows.",
  },
  {
    icon: Braces,
    title: "Bind your own JSON",
    body: "Declare a variable schema, paste sample data, and preview the rendered document instantly.",
  },
  {
    icon: Zap,
    title: "Sync or batch",
    body: "One PDF in a single request, or queue thousands with progress polling and signed webhooks.",
  },
  {
    icon: Plug,
    title: "REST + MCP",
    body: "The same appkey powers HTTP endpoints and an MCP server your AI agents can call directly.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileStack className="size-4.5" />
            </span>
            <span className="text-display text-[15px] font-semibold">Report Flow</span>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">
              Open dashboard <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="grid-dots pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative mx-auto max-w-6xl px-5 py-24 text-center sm:py-32">
            <span className="text-mono inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] tracking-wide text-muted-foreground uppercase">
              <Terminal className="size-3 text-primary" /> documents as infrastructure
            </span>
            <h1 className="mx-auto mt-7 max-w-3xl text-4xl leading-[1.05] font-bold text-balance sm:text-6xl">
              Design the document once.
              <span className="block text-primary">Generate it a million times.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Report Flow replaces hardcoded PDF layouts with versioned templates you build visually
              — then renders them from your backend, your ERP, or an AI agent.
            </p>
            <div className="mt-9 flex justify-center">
              <Button asChild size="lg">
                <Link to="/auth">
                  Start building templates <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-xl border border-border bg-surface text-left shadow-panel">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="size-2 rounded-full bg-destructive/70" />
                <span className="size-2 rounded-full bg-warning/70" />
                <span className="size-2 rounded-full bg-success/70" />
                <span className="text-mono ml-2 text-[11px] text-muted-foreground">
                  POST /v1/documents/generate
                </span>
              </div>
              <pre className="text-mono scroll-slim overflow-x-auto p-4 text-[12px] leading-relaxed text-muted-foreground">
                {`curl https://api.reportflow.dev/v1/documents/generate \\
  -H "Authorization: Bearer $APPKEY" \\
  -d '{
    "template_id": "tpl_invoice_a4",
    "data": { "invoice": { "number": "INV-2026-0148" } }
  }'`}
              </pre>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-surface p-6 transition-colors hover:border-border-strong"
              >
                <feature.icon className="size-5 text-primary" />
                <h2 className="mt-4 text-base font-semibold">{feature.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Report Flow — document templates as an API.</span>
          <Link to="/auth" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
