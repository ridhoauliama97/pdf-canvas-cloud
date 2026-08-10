import {
  DEFAULT_STYLE,
  defaultPage,
  type CanvasElement,
  type ElementStyle,
  type TemplateDoc,
} from "@/types/template";
import { deriveSchema } from "@/lib/template-engine";

type Partial2<T> = { [K in keyof T]?: T[K] | undefined };

let counter = 0;
export function newId(prefix = "el"): string {
  counter += 1;
  return `${prefix}_${Math.random().toString(36).slice(2, 7)}${counter}`;
}

export function makeElement(
  type: CanvasElement["type"],
  box: { x: number; y: number; w: number; h: number },
  overrides: Partial2<CanvasElement> = {},
  style: Partial2<ElementStyle> = {},
): CanvasElement {
  return {
    id: newId(type),
    type,
    page: 1,
    ...box,
    style: { ...DEFAULT_STYLE, ...style },
    ...overrides,
  } as CanvasElement;
}

const INVOICE_DATA = {
  company: {
    name: "Nusantara Digital",
    address: "Jl. Jend. Sudirman Kav. 52, Jakarta 12190",
    email: "billing@nusantara.digital",
    phone: "+62 21 5090 1234",
    tax_id: "01.234.567.8-901.000",
  },
  customer: {
    name: "PT Cahaya Abadi",
    address: "Jl. Gatot Subroto No. 18, Bandung 40263",
    email: "finance@cahayaabadi.co.id",
  },
  invoice: {
    number: "INV-2026-0148",
    date: "2026-08-10",
    due_date: "2026-09-09",
    po_number: "PO-88213",
    notes: "Pembayaran melalui transfer bank. Cantumkan nomor invoice pada berita transfer.",
  },
  items: [
    { description: "Platform subscription — Growth plan", qty: 12, unit_price: 4500000 },
    { description: "Onboarding & data migration", qty: 1, unit_price: 18500000 },
    { description: "Priority support add-on", qty: 12, unit_price: 950000 },
  ],
  totals: { subtotal: 83900000, discount: 0, tax: 9229000, grand_total: 93129000 },
};

function documentShell(title: string, accent = "#0B0F14"): CanvasElement[] {
  return [
    makeElement(
      "text",
      { x: 48, y: 44, w: 300, h: 34 },
      { text: title },
      { fontSize: 26, fontWeight: 700, color: accent, fontFamily: "Space Grotesk", letterSpacing: -0.5 },
    ),
    makeElement(
      "field",
      { x: 430, y: 46, w: 316, h: 20 },
      { binding: "company.name", format: { type: "text" } },
      { fontSize: 14, fontWeight: 600, align: "right", color: accent },
    ),
    makeElement(
      "text",
      { x: 430, y: 68, w: 316, h: 52 },
      { text: "{{company.address}}\n{{company.email}} · {{company.phone}}" },
      { fontSize: 9.5, color: "#6b7280", align: "right", lineHeight: 1.55 },
    ),
    makeElement(
      "shape",
      { x: 48, y: 132, w: 698, h: 2 },
      { shape: "rect" },
      { background: accent },
    ),
    makeElement(
      "pagenumber",
      { x: 566, y: 1052, w: 180, h: 16 },
      { text: "Page {{page}} of {{pages}}" },
      { fontSize: 9, color: "#9ca3af", align: "right" },
    ),
  ];
}

function partyBlock(y: number, label: string, prefix: string): CanvasElement[] {
  return [
    makeElement(
      "text",
      { x: 48, y, w: 200, h: 14 },
      { text: label },
      { fontSize: 8.5, fontWeight: 600, color: "#9ca3af", uppercase: true, letterSpacing: 0.8 },
    ),
    makeElement(
      "field",
      { x: 48, y: y + 18, w: 300, h: 18 },
      { binding: `${prefix}.name` },
      { fontSize: 12.5, fontWeight: 600 },
    ),
    makeElement(
      "text",
      { x: 48, y: y + 38, w: 300, h: 46 },
      { text: `{{${prefix}.address}}\n{{${prefix}.email}}` },
      { fontSize: 9.5, color: "#6b7280", lineHeight: 1.5 },
    ),
  ];
}

function metaRow(y: number, label: string, binding: string, format?: CanvasElement["format"]): CanvasElement[] {
  return [
    makeElement(
      "text",
      { x: 470, y, w: 130, h: 14 },
      { text: label },
      { fontSize: 9.5, color: "#6b7280", align: "right" },
    ),
    makeElement(
      "field",
      { x: 606, y, w: 140, h: 14 },
      { binding, format },
      { fontSize: 9.5, fontWeight: 600, align: "right" },
    ),
  ];
}

function totalRow(
  y: number,
  label: string,
  binding: string,
  options: { bold?: boolean; visibleIf?: CanvasElement["visibleIf"] } = {},
): CanvasElement[] {
  return [
    makeElement(
      "text",
      { x: 450, y, w: 150, h: 16 },
      { text: label, visibleIf: options.visibleIf },
      {
        fontSize: options.bold ? 11.5 : 10,
        fontWeight: options.bold ? 700 : 400,
        color: options.bold ? "#111827" : "#6b7280",
        align: "right",
      },
    ),
    makeElement(
      "field",
      {
        x: 606,
        y,
        w: 140,
        h: 16,
      },
      { binding, format: { type: "currency", currency: "IDR" }, visibleIf: options.visibleIf },
      {
        fontSize: options.bold ? 13 : 10.5,
        fontWeight: options.bold ? 700 : 500,
        align: "right",
        color: options.bold ? "#111827" : "#374151",
      },
    ),
  ];
}

function itemsTable(y: number, accent: string, priceLabel = "Unit price"): CanvasElement {
  return makeElement(
    "table",
    { x: 48, y, w: 698, h: 160 },
    {
      arrayBinding: "items",
      showHeader: true,
      rowHeight: 30,
      striped: true,
      headerBackground: accent,
      headerColor: "#ffffff",
      columns: [
        { id: newId("col"), header: "Description", binding: "description", width: 330, align: "left" },
        {
          id: newId("col"),
          header: "Qty",
          binding: "qty",
          width: 70,
          align: "right",
          format: { type: "number" },
        },
        {
          id: newId("col"),
          header: priceLabel,
          binding: "unit_price",
          width: 148,
          align: "right",
          format: { type: "currency", currency: "IDR" },
        },
        {
          id: newId("col"),
          header: "Amount",
          binding: "",
          expression: "qty * unit_price",
          width: 150,
          align: "right",
          format: { type: "currency", currency: "IDR" },
        },
      ],
    },
    { fontSize: 10 },
  );
}

function invoiceDoc(): TemplateDoc {
  const accent = "#0B0F14";
  const elements: CanvasElement[] = [
    ...documentShell("INVOICE", accent),
    ...partyBlock(164, "Billed to", "customer"),
    ...metaRow(164, "Invoice number", "invoice.number"),
    ...metaRow(186, "Issue date", "invoice.date", { type: "date", dateFormat: "DD/MM/YYYY" }),
    ...metaRow(208, "Due date", "invoice.due_date", { type: "date", dateFormat: "DD/MM/YYYY" }),
    ...metaRow(230, "PO number", "invoice.po_number"),
    itemsTable(290, accent),
    ...totalRow(470, "Subtotal", "totals.subtotal"),
    ...totalRow(492, "Discount", "totals.discount", {
      visibleIf: { path: "totals.discount", op: "truthy" },
    }),
    ...totalRow(514, "VAT 11%", "totals.tax"),
    makeElement("shape", { x: 450, y: 540, w: 296, h: 1 }, { shape: "rect" }, { background: "#e5e7eb" }),
    ...totalRow(550, "Amount due", "totals.grand_total", { bold: true }),
    makeElement(
      "text",
      { x: 48, y: 620, w: 380, h: 16 },
      { text: "Notes" },
      { fontSize: 8.5, fontWeight: 600, color: "#9ca3af", uppercase: true, letterSpacing: 0.8 },
    ),
    makeElement(
      "text",
      { x: 48, y: 638, w: 380, h: 60 },
      { text: "{{invoice.notes}}" },
      { fontSize: 9.5, color: "#6b7280", lineHeight: 1.6 },
    ),
    makeElement(
      "qrcode",
      { x: 656, y: 620, w: 90, h: 90 },
      { codeValue: "{{invoice.number}}" },
      {},
    ),
  ];
  return {
    page: defaultPage("A4"),
    layout: { elements },
    sampleData: INVOICE_DATA,
    schema: deriveSchema(INVOICE_DATA),
  };
}

function quotationDoc(): TemplateDoc {
  const accent = "#0B0F14";
  const data = {
    ...INVOICE_DATA,
    quotation: {
      number: "QUO-2026-0091",
      date: "2026-08-10",
      valid_until: "2026-08-31",
      terms: "Harga berlaku 21 hari. Belum termasuk PPN 11%.",
    },
  };
  const elements: CanvasElement[] = [
    ...documentShell("QUOTATION", accent),
    ...partyBlock(164, "Prepared for", "customer"),
    ...metaRow(164, "Quotation no.", "quotation.number"),
    ...metaRow(186, "Date", "quotation.date", { type: "date" }),
    ...metaRow(208, "Valid until", "quotation.valid_until", { type: "date" }),
    itemsTable(290, accent, "Rate"),
    ...totalRow(470, "Subtotal", "totals.subtotal"),
    ...totalRow(492, "VAT 11%", "totals.tax"),
    ...totalRow(520, "Estimated total", "totals.grand_total", { bold: true }),
    makeElement(
      "text",
      { x: 48, y: 600, w: 400, h: 60 },
      { text: "Terms\n{{quotation.terms}}" },
      { fontSize: 9.5, color: "#6b7280", lineHeight: 1.6 },
    ),
    makeElement(
      "text",
      { x: 500, y: 700, w: 246, h: 80 },
      { text: "Approved by\n\n\n________________________" },
      { fontSize: 9.5, color: "#6b7280", lineHeight: 1.8 },
    ),
  ];
  return { page: defaultPage("A4"), layout: { elements }, sampleData: data, schema: deriveSchema(data) };
}

function purchaseOrderDoc(): TemplateDoc {
  const accent = "#0B0F14";
  const data = {
    ...INVOICE_DATA,
    supplier: {
      name: "CV Sinar Logistik",
      address: "Jl. Raya Bekasi KM 22, Jakarta 13910",
      email: "sales@sinarlogistik.co.id",
    },
    order: { number: "PO-2026-0451", date: "2026-08-10", delivery_date: "2026-08-24", terms: "Net 30" },
  };
  const elements: CanvasElement[] = [
    ...documentShell("PURCHASE ORDER", accent),
    ...partyBlock(164, "Supplier", "supplier"),
    ...metaRow(164, "PO number", "order.number"),
    ...metaRow(186, "Order date", "order.date", { type: "date" }),
    ...metaRow(208, "Delivery by", "order.delivery_date", { type: "date" }),
    ...metaRow(230, "Payment terms", "order.terms"),
    itemsTable(290, accent),
    ...totalRow(470, "Subtotal", "totals.subtotal"),
    ...totalRow(492, "VAT 11%", "totals.tax"),
    ...totalRow(520, "Order total", "totals.grand_total", { bold: true }),
    makeElement(
      "text",
      { x: 48, y: 610, w: 698, h: 40 },
      { text: "Deliver to: {{company.address}}" },
      { fontSize: 9.5, color: "#6b7280" },
    ),
  ];
  return { page: defaultPage("A4"), layout: { elements }, sampleData: data, schema: deriveSchema(data) };
}

function receiptDoc(): TemplateDoc {
  const accent = "#0B0F14";
  const data = {
    ...INVOICE_DATA,
    receipt: { number: "RCP-2026-3312", date: "2026-08-10", method: "Bank transfer — BCA" },
  };
  const page = defaultPage("A4");
  const elements: CanvasElement[] = [
    ...documentShell("RECEIPT", accent),
    ...metaRow(164, "Receipt no.", "receipt.number"),
    ...metaRow(186, "Paid on", "receipt.date", { type: "date" }),
    ...metaRow(208, "Method", "receipt.method"),
    ...partyBlock(164, "Received from", "customer"),
    makeElement(
      "text",
      { x: 48, y: 300, w: 300, h: 16 },
      { text: "Amount received" },
      { fontSize: 8.5, fontWeight: 600, color: "#9ca3af", uppercase: true, letterSpacing: 0.8 },
    ),
    makeElement(
      "field",
      { x: 48, y: 320, w: 400, h: 44 },
      { binding: "totals.grand_total", format: { type: "currency", currency: "IDR" } },
      { fontSize: 32, fontWeight: 700, color: accent, fontFamily: "Space Grotesk" },
    ),
    makeElement(
      "text",
      { x: 48, y: 386, w: 500, h: 40 },
      { text: "For invoice {{invoice.number}} — thank you for your business." },
      { fontSize: 10, color: "#6b7280" },
    ),
    makeElement("qrcode", { x: 656, y: 300, w: 90, h: 90 }, { codeValue: "{{receipt.number}}" }, {}),
  ];
  return { page, layout: { elements }, sampleData: data, schema: deriveSchema(data) };
}

function deliveryNoteDoc(): TemplateDoc {
  const accent = "#0B0F14";
  const data = {
    ...INVOICE_DATA,
    delivery: {
      number: "DN-2026-0771",
      date: "2026-08-10",
      driver: "Bagus Setiawan",
      vehicle: "B 9021 XKL",
    },
  };
  const elements: CanvasElement[] = [
    ...documentShell("DELIVERY NOTE", accent),
    ...partyBlock(164, "Deliver to", "customer"),
    ...metaRow(164, "Note number", "delivery.number"),
    ...metaRow(186, "Date", "delivery.date", { type: "date" }),
    ...metaRow(208, "Driver", "delivery.driver"),
    ...metaRow(230, "Vehicle", "delivery.vehicle"),
    makeElement(
      "table",
      { x: 48, y: 290, w: 698, h: 160 },
      {
        arrayBinding: "items",
        showHeader: true,
        rowHeight: 30,
        striped: true,
        headerBackground: accent,
        headerColor: "#ffffff",
        columns: [
          { id: newId("col"), header: "Item", binding: "description", width: 500, align: "left" },
          {
            id: newId("col"),
            header: "Qty",
            binding: "qty",
            width: 198,
            align: "right",
            format: { type: "number" },
          },
        ],
      },
      { fontSize: 10 },
    ),
    makeElement(
      "text",
      { x: 48, y: 620, w: 220, h: 90 },
      { text: "Received by\n\n\n________________________" },
      { fontSize: 9.5, color: "#6b7280", lineHeight: 1.8 },
    ),
    makeElement(
      "text",
      { x: 526, y: 620, w: 220, h: 90 },
      { text: "Delivered by\n\n\n________________________" },
      { fontSize: 9.5, color: "#6b7280", lineHeight: 1.8, align: "left" },
    ),
    makeElement("barcode", { x: 48, y: 520, w: 240, h: 56 }, { codeValue: "{{delivery.number}}" }, {}),
  ];
  return { page: defaultPage("A4"), layout: { elements }, sampleData: data, schema: deriveSchema(data) };
}

function blankDoc(): TemplateDoc {
  const data = { title: "Untitled document", body: "Start dragging elements onto the canvas." };
  return {
    page: defaultPage("A4"),
    layout: {
      elements: [
        makeElement(
          "text",
          { x: 48, y: 48, w: 400, h: 34 },
          { text: "{{title}}" },
          { fontSize: 24, fontWeight: 700, fontFamily: "Space Grotesk", color: "#0B0F14" },
        ),
        makeElement("text", { x: 48, y: 96, w: 400, h: 40 }, { text: "{{body}}" }, { fontSize: 11 }),
      ],
    },
    sampleData: data,
    schema: deriveSchema(data),
  };
}

export interface Starter {
  key: string;
  name: string;
  docType: string;
  description: string;
  build: () => TemplateDoc;
}

export const STARTERS: Starter[] = [
  {
    key: "invoice",
    name: "Invoice",
    docType: "invoice",
    description: "Line items, VAT, totals and payment notes with a QR reference.",
    build: invoiceDoc,
  },
  {
    key: "quotation",
    name: "Quotation",
    docType: "quotation",
    description: "Priced proposal with validity window, terms and signature block.",
    build: quotationDoc,
  },
  {
    key: "purchase_order",
    name: "Purchase order",
    docType: "purchase_order",
    description: "Supplier details, ordered lines, delivery date and payment terms.",
    build: purchaseOrderDoc,
  },
  {
    key: "receipt",
    name: "Receipt",
    docType: "receipt",
    description: "Payment confirmation with a large amount block and QR code.",
    build: receiptDoc,
  },
  {
    key: "delivery_note",
    name: "Delivery note",
    docType: "delivery_note",
    description: "Packing list with quantities, barcode and dual signature area.",
    build: deliveryNoteDoc,
  },
  {
    key: "blank",
    name: "Blank canvas",
    docType: "custom",
    description: "Empty A4 page — build your own layout from scratch.",
    build: blankDoc,
  },
];

export function getStarter(key: string): Starter {
  return STARTERS.find((starter) => starter.key === key) ?? STARTERS[STARTERS.length - 1]!;
}
