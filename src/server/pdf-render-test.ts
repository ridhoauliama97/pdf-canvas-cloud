/**
 * Test script for pdf-render.
 * Run with: npx tsx src/server/pdf-render-test.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderPdf } from "./pdf-render";
import type { TemplateLayout, PageSetup } from "@/types/template";

// ── Sample layout ────────────────────────────────────────────────────────────

const sampleLayout: TemplateLayout = {
  elements: [
    {
      id: "title",
      type: "text",
      x: 48,
      y: 48,
      w: 700,
      h: 40,
      page: 1,
      text: "Invoice #{{invoiceNumber}}",
      style: {
        fontFamily: "Helvetica",
        fontSize: 24,
        fontWeight: 700,
        color: "#1e40af",
        align: "left",
        lineHeight: 1.2,
      },
    },
    {
      id: "subtitle",
      type: "field",
      x: 48,
      y: 92,
      w: 700,
      h: 24,
      page: 1,
      binding: "date",
      format: { type: "date", dateFormat: "DD MMM YYYY" },
      style: {
        fontFamily: "Helvetica",
        fontSize: 12,
        fontWeight: 400,
        color: "#6b7280",
        align: "left",
        lineHeight: 1.4,
      },
    },
    {
      id: "client-name",
      type: "text",
      x: 48,
      y: 130,
      w: 300,
      h: 20,
      page: 1,
      text: "Bill to: {{clientName}}",
      style: {
        fontFamily: "Helvetica",
        fontSize: 11,
        fontWeight: 600,
        color: "#374151",
        align: "left",
        lineHeight: 1.4,
      },
    },
    {
      id: "divider",
      type: "shape",
      x: 48,
      y: 160,
      w: 700,
      h: 1,
      page: 1,
      shape: "line",
      style: {
        fontFamily: "Helvetica",
        fontSize: 12,
        fontWeight: 400,
        color: "#d1d5db",
        align: "left",
        lineHeight: 1.4,
        borderWidth: 1,
        borderColor: "#d1d5db",
      },
    },
    {
      id: "items-table",
      type: "table",
      x: 48,
      y: 175,
      w: 700,
      h: 120,
      page: 1,
      arrayBinding: "items",
      rowHeight: 24,
      showHeader: true,
      striped: true,
      headerBackground: "#1e40af",
      headerColor: "#ffffff",
      columns: [
        {
          id: "col-desc",
          header: "Description",
          binding: "description",
          width: 350,
          align: "left",
        },
        {
          id: "col-qty",
          header: "Qty",
          binding: "quantity",
          width: 80,
          align: "center",
          format: { type: "number", precision: 0 },
        },
        {
          id: "col-price",
          header: "Unit Price",
          binding: "price",
          width: 135,
          align: "right",
          format: { type: "currency", currency: "IDR" },
        },
        {
          id: "col-total",
          header: "Total",
          binding: "total",
          expression: "quantity * price",
          width: 135,
          align: "right",
          format: { type: "currency", currency: "IDR" },
        },
      ],
      style: {
        fontFamily: "Helvetica",
        fontSize: 10,
        fontWeight: 400,
        color: "#1f2937",
        align: "left",
        lineHeight: 1.4,
        borderWidth: 0.5,
        borderColor: "#e5e7eb",
      },
    },
    {
      id: "grand-total-label",
      type: "text",
      x: 480,
      y: 530,
      w: 120,
      h: 24,
      page: 1,
      text: "Grand Total:",
      visibleIf: { path: "items", op: "truthy" },
      style: {
        fontFamily: "Helvetica",
        fontSize: 12,
        fontWeight: 700,
        color: "#1e40af",
        align: "right",
        lineHeight: 1.4,
      },
    },
    {
      id: "grand-total-value",
      type: "field",
      x: 610,
      y: 530,
      w: 138,
      h: 24,
      page: 1,
      expression: "items.reduce((sum, item) => sum + item.quantity * item.price, 0)",
      format: { type: "currency", currency: "IDR" },
      visibleIf: { path: "items", op: "truthy" },
      style: {
        fontFamily: "Helvetica",
        fontSize: 12,
        fontWeight: 700,
        color: "#1e40af",
        align: "right",
        lineHeight: 1.4,
      },
    },
    {
      id: "page-footer",
      type: "pagenumber",
      x: 350,
      y: 1080,
      w: 100,
      h: 20,
      page: 1,
      text: "Page {{pageNumber}} of {{totalPages}}",
      style: {
        fontFamily: "Helvetica",
        fontSize: 9,
        fontWeight: 400,
        color: "#9ca3af",
        align: "center",
        lineHeight: 1.4,
      },
    },
  ],
};

// ── Sample data ──────────────────────────────────────────────────────────────

const sampleData = {
  invoiceNumber: "INV-2026-001",
  date: "2026-08-10",
  clientName: "Acme Corporation",
  items: [
    { description: "Widget A — Standard", quantity: 10, price: 150000 },
    { description: "Widget B — Premium", quantity: 5, price: 350000 },
    { description: "Installation Service", quantity: 1, price: 500000 },
    { description: "Annual Support Plan", quantity: 1, price: 1200000 },
  ],
};

// ── Sample page setup ────────────────────────────────────────────────────────

const samplePage: PageSetup = {
  format: "A4",
  width: 794,
  height: 1123,
  margin: { top: 48, right: 48, bottom: 56, left: 48 },
  pageCount: 1,
  background: "#ffffff",
};

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating PDF...");

  const buffer = await renderPdf(sampleLayout, samplePage, sampleData);

  const outputDir = join(process.cwd(), ".tmp", "pdf-test");
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {
    // directory already exists
  }

  const outputPath = join(outputDir, "test-output.pdf");
  writeFileSync(outputPath, buffer);

  console.log(`PDF written to: ${outputPath}`);
  console.log(`Buffer size: ${buffer.length} bytes`);
}

main().catch((err) => {
  console.error("PDF generation failed:", err);
  process.exit(1);
});
