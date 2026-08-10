import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  Loader2,
  Pencil,
  Save,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { generateDocument } from "@/server/generate";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { jsonValue } from "@/lib/json";
import { deriveSchema } from "@/lib/template-engine";
import { makeElement, newId } from "@/lib/starter-templates";
import { EditorCanvas } from "@/components/editor/canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CanvasElement, ElementType, PageSetup, TemplateLayout } from "@/types/template";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  head: () => ({
    meta: [
      { title: "Template editor — Report Flow" },
      {
        name: "description",
        content:
          "Drag-and-drop document editor: place text, data fields and repeating tables, then preview with sample JSON.",
      },
      { property: "og:title", content: "Template editor — Report Flow" },
      { property: "og:description", content: "Design document templates visually." },
    ],
  }),
  component: EditorPage,
});

const PALETTE: { type: ElementType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "field", label: "Data field" },
  { type: "table", label: "Table" },
  { type: "image", label: "Image" },
  { type: "shape", label: "Line" },
  { type: "qrcode", label: "QR code" },
  { type: "barcode", label: "Barcode" },
  { type: "pagenumber", label: "Page number" },
];

function newElement(type: ElementType, at: { x: number; y: number; page: number }): CanvasElement {
  const box = { x: at.x, y: at.y, w: 220, h: 22 };
  const page = { page: at.page };
  switch (type) {
    case "field":
      return makeElement(
        "field",
        { ...box, w: 180, h: 20 },
        { ...page, binding: "invoice.number" },
      );
    case "table":
      return makeElement(
        "table",
        { ...box, w: 500, h: 120 },
        {
          ...page,
          arrayBinding: "items",
          rowHeight: 28,
          showHeader: true,
          striped: true,
          columns: [
            {
              id: newId("col"),
              header: "Description",
              binding: "description",
              width: 3,
              align: "left",
            },
            { id: newId("col"), header: "Qty", binding: "qty", width: 1, align: "right" },
            {
              id: newId("col"),
              header: "Amount",
              binding: "amount",
              width: 1.4,
              align: "right",
              format: { type: "currency", currency: "IDR" },
            },
          ],
        },
      );
    case "image":
      return makeElement("image", { ...box, w: 120, h: 60 }, { ...page, fit: "contain" });
    case "shape":
      return makeElement("shape", { ...box, w: 400, h: 2 }, { ...page, shape: "line" });
    case "qrcode":
      return makeElement(
        "qrcode",
        { ...box, w: 80, h: 80 },
        { ...page, codeValue: "{{invoice.number}}" },
      );
    case "barcode":
      return makeElement(
        "barcode",
        { ...box, w: 160, h: 48 },
        { ...page, codeValue: "{{invoice.number}}" },
      );
    case "pagenumber":
      return makeElement(
        "pagenumber",
        { ...box, w: 160, h: 16 },
        { ...page, text: "Page {{page}} of {{pages}}" },
      );
    default:
      return makeElement("text", box, { ...page, text: "New text" });
  }
}

function EditorPage() {
  const { templateId } = Route.useParams();
  const { canEdit } = useWorkspace();
  const queryClient = useQueryClient();

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [page, setPage] = useState<PageSetup | null>(null);
  const [sampleText, setSampleText] = useState("{}");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"design" | "preview">("design");
  const [zoom, setZoom] = useState(0.8);
  const [dirty, setDirty] = useState(false);

  const template = useQuery({
    queryKey: ["template", templateId],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("templates")
        .select("id, name, status, company_id, current_version_id")
        .eq("id", templateId)
        .single();
      if (error) throw error;
      const { data: version, error: versionError } = await supabase
        .from("template_versions")
        .select("id, version, layout, page, sample_data")
        .eq("template_id", templateId)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      if (versionError) throw versionError;
      return { row, version };
    },
  });

  useEffect(() => {
    if (!template.data) return;
    const version = template.data.version;
    setElements(((version.layout as unknown as TemplateLayout)?.elements ?? []) as CanvasElement[]);
    setPage(version.page as unknown as PageSetup);
    setSampleText(JSON.stringify(version.sample_data ?? {}, null, 2));
    setDirty(false);
  }, [template.data]);

  const sampleData = useMemo(() => {
    try {
      return JSON.parse(sampleText) as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [sampleText]);

  const sampleValid = useMemo(() => {
    try {
      JSON.parse(sampleText);
      return true;
    } catch {
      return false;
    }
  }, [sampleText]);

  const selected = elements.find((element) => element.id === selectedId) ?? null;

  const update = (patch: Partial<CanvasElement>) => {
    if (!selected) return;
    setElements((current) =>
      current.map((element) => (element.id === selected.id ? { ...element, ...patch } : element)),
    );
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: async ({ publish }: { publish: boolean }) => {
      if (!template.data || !page) return;
      const nextVersion = template.data.version.version + 1;
      const { data: inserted, error } = await supabase
        .from("template_versions")
        .insert({
          template_id: templateId,
          company_id: template.data.row.company_id,
          version: nextVersion,
          layout: jsonValue({ elements }),
          page: jsonValue(page),
          sample_data: jsonValue(sampleData),
          data_schema: jsonValue(deriveSchema(sampleData)),
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: updateError } = await supabase
        .from("templates")
        .update(
          publish
            ? { current_version_id: inserted.id, status: "published", page_format: page.format }
            : { page_format: page.format },
        )
        .eq("id", templateId);
      if (updateError) throw updateError;
    },
    onSuccess: async (_result, variables) => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(variables.publish ? "Version published" : "Draft saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generatePdf = useMutation({
    mutationFn: async () => {
      const result = await generateDocument({ data: { templateId, data: sampleData } });
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        <span>
          PDF generated!{" "}
          <a
            href={result.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Download PDF
          </a>
        </span>,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (template.isLoading || !page) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/templates">
            <ArrowLeft className="size-4" /> Templates
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{template.data?.row.name}</p>
        </div>
        <Badge variant="secondary" className="text-mono">
          v{template.data?.version.version}
        </Badge>
        {dirty && <span className="text-xs text-muted-foreground">unsaved changes</span>}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="text-mono w-10 text-center text-[11px]">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
            >
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "design" ? "preview" : "design")}
          >
            {mode === "design" ? <Eye className="size-4" /> : <Pencil className="size-4" />}
            {mode === "design" ? "Preview" : "Design"}
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => save.mutate({ publish: false })}
                disabled={save.isPending}
              >
                <Save className="size-4" /> Save draft
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate({ publish: true })}
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Publish
              </Button>
              {template.data?.row.status === "published" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generatePdf.mutate()}
                  disabled={generatePdf.isPending}
                >
                  {generatePdf.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Generate PDF
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface p-3 lg:flex">
          <p className="text-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Elements
          </p>
          <div className="mt-2 grid gap-1.5">
            {PALETTE.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => {
                  const element = newElement(item.type, {
                    x: page.margin.left,
                    y: page.margin.top + 40,
                    page: 1,
                  });
                  setElements((current) => [...current, element]);
                  setSelectedId(element.id);
                  setMode("design");
                  setDirty(true);
                }}
                className="rounded-md border border-border bg-background px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/60"
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="text-mono mt-6 text-[10px] tracking-widest text-muted-foreground uppercase">
            Layers
          </p>
          <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {elements.map((element) => (
              <button
                key={element.id}
                type="button"
                onClick={() => {
                  setSelectedId(element.id);
                  setMode("design");
                }}
                className={cn(
                  "block w-full truncate rounded px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-surface-2",
                  selectedId === element.id && "bg-surface-2 text-primary",
                )}
              >
                {element.name ?? element.type} · {element.type}
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-auto bg-surface-2/40 canvas-grid">
          <EditorCanvas
            page={page}
            elements={elements}
            data={sampleData}
            mode={mode}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={(next) => {
              setElements(next);
              setDirty(true);
            }}
            onDropField={(payload, position) => {
              const element = makeElement(
                "field",
                { x: position.x, y: position.y, w: 180, h: 20 },
                { page: position.page, binding: payload.value },
              );
              setElements((current) => [...current, element]);
              setSelectedId(element.id);
              setDirty(true);
            }}
          />
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface lg:flex">
          <Tabs defaultValue="element" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-3">
              <TabsTrigger value="element">Element</TabsTrigger>
              <TabsTrigger value="data">Sample data</TabsTrigger>
              <TabsTrigger value="page">Page</TabsTrigger>
            </TabsList>

            <TabsContent value="element" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Select an element on the canvas to edit its content and styling.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{selected.type}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        setElements((current) => current.filter((item) => item.id !== selected.id));
                        setSelectedId(null);
                        setDirty(true);
                      }}
                    >
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </div>

                  {(selected.type === "text" || selected.type === "pagenumber") && (
                    <div className="space-y-1.5">
                      <Label>Text (supports {"{{merge.tags}}"})</Label>
                      <Textarea
                        rows={3}
                        value={selected.text ?? ""}
                        onChange={(event) => update({ text: event.target.value })}
                      />
                    </div>
                  )}

                  {selected.type === "field" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Data path</Label>
                        <Input
                          value={selected.binding ?? ""}
                          onChange={(event) => update({ binding: event.target.value })}
                          placeholder="invoice.number"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Format</Label>
                        <Select
                          value={selected.format?.type ?? "text"}
                          onValueChange={(value) =>
                            update({
                              format: {
                                type: value as "text" | "currency" | "number" | "date",
                                currency: "IDR",
                                dateFormat: "DD/MM/YYYY",
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="currency">Currency (IDR)</SelectItem>
                            <SelectItem value="date">Date (DD/MM/YYYY)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Calculated expression (optional)</Label>
                        <Input
                          value={selected.expression ?? ""}
                          onChange={(event) => update({ expression: event.target.value })}
                          placeholder="totals.subtotal * 0.11"
                        />
                      </div>
                    </>
                  )}

                  {selected.type === "table" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Array path</Label>
                        <Input
                          value={selected.arrayBinding ?? ""}
                          onChange={(event) => update({ arrayBinding: event.target.value })}
                          placeholder="items"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Row height</Label>
                        <Input
                          type="number"
                          value={selected.rowHeight ?? 28}
                          onChange={(event) => update({ rowHeight: Number(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Columns</Label>
                        {(selected.columns ?? []).map((column, index) => (
                          <div key={column.id} className="grid grid-cols-2 gap-1.5">
                            <Input
                              value={column.header}
                              onChange={(event) => {
                                const columns = [...(selected.columns ?? [])];
                                columns[index] = { ...column, header: event.target.value };
                                update({ columns });
                              }}
                            />
                            <Input
                              value={column.binding}
                              onChange={(event) => {
                                const columns = [...(selected.columns ?? [])];
                                columns[index] = { ...column, binding: event.target.value };
                                update({ columns });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {(selected.type === "qrcode" || selected.type === "barcode") && (
                    <div className="space-y-1.5">
                      <Label>Code value</Label>
                      <Input
                        value={selected.codeValue ?? ""}
                        onChange={(event) => update({ codeValue: event.target.value })}
                      />
                    </div>
                  )}

                  {selected.type === "image" && (
                    <div className="space-y-1.5">
                      <Label>Image URL</Label>
                      <Input
                        value={selected.src ?? ""}
                        onChange={(event) => update({ src: event.target.value })}
                        placeholder="https://… or {{company.logo}}"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {(["x", "y", "w", "h"] as const).map((key) => (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-mono uppercase">{key}</Label>
                        <Input
                          type="number"
                          value={selected[key]}
                          onChange={(event) => update({ [key]: Number(event.target.value) })}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Font size</Label>
                      <Input
                        type="number"
                        value={selected.style.fontSize}
                        onChange={(event) =>
                          update({
                            style: { ...selected.style, fontSize: Number(event.target.value) },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Weight</Label>
                      <Select
                        value={String(selected.style.fontWeight)}
                        onValueChange={(value) =>
                          update({ style: { ...selected.style, fontWeight: Number(value) } })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[300, 400, 500, 600, 700].map((weight) => (
                            <SelectItem key={weight} value={String(weight)}>
                              {weight}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Align</Label>
                      <Select
                        value={selected.style.align}
                        onValueChange={(value) =>
                          update({
                            style: {
                              ...selected.style,
                              align: value as "left" | "center" | "right",
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Color</Label>
                      <Input
                        type="color"
                        value={selected.style.color}
                        onChange={(event) =>
                          update({ style: { ...selected.style, color: event.target.value } })
                        }
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const copy = {
                        ...selected,
                        id: newId(),
                        x: selected.x + 12,
                        y: selected.y + 12,
                      };
                      setElements((current) => [...current, copy]);
                      setSelectedId(copy.id);
                      setDirty(true);
                    }}
                  >
                    <Copy className="size-4" /> Duplicate
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="data" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Sample JSON payload</Label>
                  <Textarea
                    className="text-mono h-72 text-[11px]"
                    value={sampleText}
                    onChange={(event) => {
                      setSampleText(event.target.value);
                      setDirty(true);
                    }}
                  />
                  {!sampleValid && <p className="text-xs text-destructive">Invalid JSON</p>}
                </div>
                <div>
                  <p className="text-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    Detected fields — drag onto the canvas
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {deriveSchema(sampleData).map((field) => (
                      <span
                        key={field.path}
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "application/x-reportflow",
                            JSON.stringify({ kind: "field", value: field.path }),
                          )
                        }
                        className="text-mono cursor-grab rounded border border-border bg-background px-1.5 py-1 text-[10px] text-muted-foreground hover:border-primary/60"
                      >
                        {field.path}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="page" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Format</Label>
                  <Select
                    value={page.format}
                    onValueChange={(value) => {
                      const size =
                        value === "Letter"
                          ? { width: 816, height: 1056 }
                          : { width: 794, height: 1123 };
                      setPage({ ...page, format: value as PageSetup["format"], ...size });
                      setDirty(true);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="Letter">Letter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["top", "right", "bottom", "left"] as const).map((side) => (
                    <div key={side} className="space-y-1.5">
                      <Label className="capitalize">{side} margin</Label>
                      <Input
                        type="number"
                        value={page.margin[side]}
                        onChange={(event) => {
                          setPage({
                            ...page,
                            margin: { ...page.margin, [side]: Number(event.target.value) },
                          });
                          setDirty(true);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
