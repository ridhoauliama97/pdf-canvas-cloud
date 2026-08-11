/**
 * PDF rendering service using @react-pdf/renderer.
 * Converts a template layout + data JSON into a PDF buffer.
 */

import { renderToBuffer, Font } from "@react-pdf/renderer";
import { Document, Page, View, Text, Image, Svg, Line, Rect } from "@react-pdf/renderer";
import React from "react";
import { paginate } from "@/lib/layout-paginate";
import {
  checkCondition,
  resolveElementValue,
  interpolate,
  evaluateExpression,
  formatValue,
} from "@/lib/template-engine";
import type {
  CanvasElement,
  ElementStyle,
  PageSetup,
  TableColumn,
  TemplateLayout,
} from "@/types/template";

// ── Font Registration ────────────────────────────────────────────────────────

// Use Helvetica as fallback (built-in to react-pdf)
// Custom fonts can be registered later with proper font files
Font.register({
  family: "Inter",
  fonts: [
    { src: "Helvetica", fontWeight: 400 },
    { src: "Helvetica-Bold", fontWeight: 700 },
  ],
});

Font.register({
  family: "Space Grotesk",
  fonts: [
    { src: "Helvetica", fontWeight: 400 },
    { src: "Helvetica-Bold", fontWeight: 700 },
  ],
});

Font.register({
  family: "JetBrains Mono",
  fonts: [
    { src: "Courier", fontWeight: 400 },
    { src: "Courier-Bold", fontWeight: 700 },
  ],
});

/** Strip undefined values from an object to satisfy exactOptionalPropertyTypes. */
function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: NonNullable<T[K]> } {
  const result = {} as any;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as { [K in keyof T]: NonNullable<T[K]> };
}

// ── Style conversion ─────────────────────────────────────────────────────────

/** Convert our ElementStyle to react-pdf style (camelCase, points). */
function toPdfStyle(style: ElementStyle): Record<string, unknown> {
  const out: Record<string, unknown> = {
    fontFamily: style.fontFamily || "Helvetica",
    fontSize: style.fontSize ?? 12,
    fontWeight: style.fontWeight ?? 400,
    fontStyle: style.italic ? "italic" : "normal",
    color: style.color || "#000000",
    textAlign: style.align || "left",
    lineHeight: style.lineHeight ?? 1.4,
  };

  if (style.letterSpacing !== undefined) out["letterSpacing"] = style.letterSpacing;
  if (style.background) out["backgroundColor"] = style.background;
  if (style.borderWidth && style.borderWidth > 0) {
    out["border"] = `${style.borderWidth}pt solid ${style.borderColor || "#000000"}`;
  }
  if (style.radius) out["borderRadius"] = style.radius;
  if (style.padding) out["padding"] = style.padding;
  if (style.uppercase) out["textTransform"] = "uppercase";

  return out;
}

/** Absolute positioning style for an element placed on the page. */
function absolutePos(el: CanvasElement, page: PageSetup): Record<string, unknown> {
  return {
    position: "absolute",
    left: el.x - page.margin.left,
    top: el.y - page.margin.top,
    width: el.w,
    height: el.h,
  };
}

// ── Element renderers ────────────────────────────────────────────────────────

/** Render a text element (static text with merge tags). */
function renderText(el: CanvasElement, data: unknown, scope?: unknown): React.ReactNode {
  const content = el.text
    ? interpolate(el.text, data, scope)
    : resolveElementValue(
        stripUndefined({
          binding: el.binding,
          expression: el.expression,
          text: el.text,
          format: el.format,
        }),
        data,
        scope,
      );

  if (content === null || content === undefined) return null;

  return React.createElement(Text, { style: toPdfStyle(el.style) as any, key: el.id }, content);
}

/** Render a field element (single variable binding). */
function renderField(el: CanvasElement, data: unknown, scope?: unknown): React.ReactNode {
  const content = resolveElementValue(
    stripUndefined({
      binding: el.binding,
      expression: el.expression,
      text: el.text,
      format: el.format,
    }),
    data,
    scope,
  );

  if (content === null || content === undefined) return null;

  return React.createElement(Text, { style: toPdfStyle(el.style) as any, key: el.id }, content);
}

/** Render a table element (may be paginated into multiple fragments). */
function renderTableFragment(
  el: CanvasElement,
  rows: unknown[],
  showHeader: boolean,
  continued: boolean,
  data: unknown,
  rowOffset = 0,
): React.ReactNode {
  const columns: TableColumn[] = el.columns ?? [];
  const rowHeight = el.rowHeight ?? 28;
  const headerBg = el.headerBackground || "#f3f4f6";
  const headerColor = el.headerColor || "#1f2937";
  const striped = el.striped ?? false;

  const children: React.ReactNode[] = [];

  // Header row (only on first fragment or if continued and showHeader)
  if (showHeader && columns.length > 0) {
    const headerCells = columns.map((col) =>
      React.createElement(
        View,
        {
          key: `hdr-${col.id}`,
          style: {
            width: col.width,
            height: rowHeight,
            display: "flex",
            alignItems: "center",
            justifyContent:
              col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start",
            padding: "0 4pt",
            backgroundColor: headerBg,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              fontSize: el.style.fontSize ?? 12,
              fontWeight: 700,
              color: headerColor,
              fontFamily: el.style.fontFamily || "Helvetica",
            },
          },
          col.header,
        ),
      ),
    );

    children.push(
      React.createElement(
        View,
        { key: "header-row", style: { flexDirection: "row", flexWrap: "nowrap" } },
        ...headerCells,
      ),
    );
  }

  // Data rows
  rows.forEach((row, rowIdx) => {
    const actualIdx = rowOffset + rowIdx;
    const isStriped = striped && actualIdx % 2 === 1;

    const cells = columns.map((col) => {
      let value: string;
      if (col.expression) {
        const exprVal = evaluateExpression(col.expression, row, data);
        value = formatValue(exprVal, col.format ?? { type: "number" });
      } else {
        const cellValue =
          typeof row === "object" && row !== null ? (row as any)[col.binding] : undefined;
        value = formatValue(cellValue, col.format);
      }

      return React.createElement(
        View,
        {
          key: `cell-${col.id}-${actualIdx}`,
          style: {
            width: col.width,
            height: rowHeight,
            display: "flex",
            alignItems: "center",
            justifyContent:
              col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start",
            padding: "0 4pt",
            ...(isStriped ? { backgroundColor: "#f9fafb" } : {}),
          } as any,
        },
        React.createElement(
          Text,
          {
            style: {
              fontSize: el.style.fontSize ?? 12,
              fontFamily: el.style.fontFamily || "Helvetica",
              fontWeight: el.style.fontWeight ?? 400,
              color: el.style.color || "#000000",
            },
          },
          value,
        ),
      );
    });

    children.push(
      React.createElement(
        View,
        { key: `row-${actualIdx}`, style: { flexDirection: "row", flexWrap: "nowrap" } },
        ...cells,
      ),
    );
  });

  if (children.length === 0) return null;

  return React.createElement(
    View,
    {
      key: el.id,
      style: {
        width: el.w,
        borderWidth: el.style.borderWidth ?? 0,
        borderColor: el.style.borderColor || "#000000",
      },
    },
    ...children,
  );
}

/** Render an image element. */
function renderImage(el: CanvasElement, data: unknown, scope?: unknown): React.ReactNode {
  const src =
    el.binding && !el.src
      ? String(
          scope !== undefined
            ? ((scope as any)[el.binding] ?? (data as any)[el.binding])
            : ((data as any)[el.binding] ?? ""),
        )
      : el.src || "";

  if (!src) return null;

  const fit = el.fit || "contain";

  return React.createElement(Image, {
    key: el.id,
    src,
    style: {
      width: el.w,
      height: el.h,
      objectFit: fit,
      ...toPdfStyle(el.style),
    },
  });
}

/** Render a shape element (rect, line, ellipse). */
function renderShape(el: CanvasElement, page: PageSetup): React.ReactNode {
  const shape = el.shape || "rect";
  const style = el.style;
  const stroke = style.borderColor || "#000000";
  const strokeWidth = style.borderWidth ?? 1;
  const fill = style.background || "none";

  if (shape === "line") {
    return React.createElement(
      Svg,
      {
        key: el.id,
        width: el.w,
        height: el.h,
        style: absolutePos(el, page) as any,
      },
      React.createElement(Line, {
        x1: 0,
        y1: 0,
        x2: el.w,
        y2: el.h,
        stroke,
        strokeWidth,
      }),
    );
  }

  if (shape === "ellipse") {
    return React.createElement(
      Svg,
      {
        key: el.id,
        width: el.w,
        height: el.h,
        style: absolutePos(el, page) as any,
      },
      React.createElement(Rect, {
        x: 0,
        y: 0,
        width: el.w,
        height: el.h,
        rx: el.w / 2,
        ry: el.h / 2,
        fill,
        stroke,
        strokeWidth,
      }),
    );
  }

  // Default: rect
  return React.createElement(
    Svg,
    {
      key: el.id,
      width: el.w,
      height: el.h,
      style: absolutePos(el, page) as any,
    },
    React.createElement(Rect, {
      x: 0,
      y: 0,
      width: el.w,
      height: el.h,
      rx: style.radius ?? 0,
      fill,
      stroke,
      strokeWidth,
    }),
  );
}

/** Render a QR code element (placeholder — actual QR generation needs a library). */
function renderQRCode(el: CanvasElement, data: unknown): React.ReactNode {
  const value = el.binding ? String((data as any)[el.binding] ?? "") : el.text || "";

  return React.createElement(
    View,
    {
      key: el.id,
      style: {
        width: el.w,
        height: el.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#000000",
      },
    },
    React.createElement(
      Text,
      { style: { fontSize: 8, fontFamily: "Courier", textAlign: "center" } },
      value ? `[QR: ${value}]` : "[QR]",
    ),
  );
}

/** Render a barcode element (placeholder — actual barcode generation needs a library). */
function renderBarcode(el: CanvasElement, data: unknown): React.ReactNode {
  const value = el.binding ? String((data as any)[el.binding] ?? "") : el.text || "";

  return React.createElement(
    View,
    {
      key: el.id,
      style: {
        width: el.w,
        height: el.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#000000",
      },
    },
    React.createElement(
      Text,
      { style: { fontSize: 8, fontFamily: "Courier", textAlign: "center" } },
      value ? `[BAR: ${value}]` : "[BAR]",
    ),
  );
}

/** Render a page number element (uses render prop for dynamic page info). */
function renderPageNumber(el: CanvasElement): React.ReactNode {
  return React.createElement(
    Text,
    {
      key: el.id,
      style: toPdfStyle(el.style) as any,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => {
        const text = el.text || "{{pageNumber}} / {{totalPages}}";
        return text
          .replace(/\{\{pageNumber\}\}/g, String(pageNumber))
          .replace(/\{\{totalPages\}\}/g, String(totalPages));
      },
    },
    "",
  );
}

// ── Main renderer ────────────────────────────────────────────────────────────

/**
 * Render a template layout + data into a PDF buffer.
 *
 * @param layout - The template layout with elements array
 * @param page   - Page configuration (size, margins, background)
 * @param data   - Template data for variable interpolation
 * @returns A Buffer containing the generated PDF
 */
export async function renderPdf(
  layout: TemplateLayout,
  page: PageSetup,
  data: Record<string, unknown>,
): Promise<Buffer> {
  const { pageCount, fragments } = paginate(layout.elements, page, data);

  // Group fragments by page number
  const pageMap = new Map<number, typeof fragments>();
  for (const frag of fragments) {
    const list = pageMap.get(frag.page) || [];
    list.push(frag);
    pageMap.set(frag.page, list);
  }

  // Build react-pdf element tree
  const pages: React.ReactNode[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageFragments = pageMap.get(pageNum) || [];

    const elements = pageFragments
      .map((frag) => {
        const el = frag.element;

        // Conditional visibility
        if (!checkCondition(el.visibleIf, data)) return null;

        // Page number element (only on the correct page)
        if (el.type === "pagenumber") {
          if (el.page !== pageNum) return null;
          return renderPageNumber(el);
        }

        // Table fragment
        if (el.type === "table") {
          const rows = frag.rows || [];
          if (rows.length === 0 && !frag.showHeader) return null;
          return renderTableFragment(
            el,
            rows,
            frag.showHeader ?? true,
            frag.continued ?? false,
            data,
            frag.rowOffset ?? 0,
          );
        }

        // Other element types (only render on matching page)
        if (el.page !== pageNum) return null;

        switch (el.type) {
          case "text":
            return renderText(el, data);
          case "field":
            return renderField(el, data);
          case "image":
            return renderImage(el, data);
          case "shape":
            return renderShape(el, page);
          case "qrcode":
            return renderQRCode(el, data);
          case "barcode":
            return renderBarcode(el, data);
          default:
            return null;
        }
      })
      .filter(Boolean);

    if (elements.length === 0 && pageNum > 1) {
      // Skip empty trailing pages
      continue;
    }

    pages.push(
      React.createElement(
        Page,
        {
          key: `page-${pageNum}`,
          size: {
            width: page.width,
            height: page.height,
          },
          style: {
            padding: `${page.margin.top}pt ${page.margin.right}pt ${page.margin.bottom}pt ${page.margin.left}pt`,
            backgroundColor: page.background || "#ffffff",
          },
        },
        React.createElement(View, { style: { position: "relative", flex: 1 } }, ...elements),
      ),
    );
  }

  // Ensure at least one page
  if (pages.length === 0) {
    pages.push(
      React.createElement(
        Page,
        {
          key: "page-1",
          size: { width: page.width, height: page.height },
          style: {
            padding: `${page.margin.top}pt ${page.margin.right}pt ${page.margin.bottom}pt ${page.margin.left}pt`,
            backgroundColor: page.background || "#ffffff",
          },
        },
        React.createElement(View, null),
      ),
    );
  }

  const doc = React.createElement(
    Document,
    {
      title: "Report",
      author: "Report Flow",
    },
    ...pages,
  );

  return renderToBuffer(doc);
}

/**
 * Render a template layout + data into a PDF file.
 *
 * @param filePath - Output file path
 * @param layout   - The template layout with elements array
 * @param page     - Page configuration
 * @param data     - Template data for variable interpolation
 */
export async function renderPdfToFile(
  filePath: string,
  layout: TemplateLayout,
  page: PageSetup,
  data: Record<string, unknown>,
): Promise<void> {
  const { renderToFile } = await import("@react-pdf/renderer");
  const { pageCount, fragments } = paginate(layout.elements, page, data);

  const pageMap = new Map<number, typeof fragments>();
  for (const frag of fragments) {
    const list = pageMap.get(frag.page) || [];
    list.push(frag);
    pageMap.set(frag.page, list);
  }

  const pages: React.ReactNode[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageFragments = pageMap.get(pageNum) || [];

    const elements = pageFragments
      .map((frag) => {
        const el = frag.element;
        if (!checkCondition(el.visibleIf, data)) return null;

        if (el.type === "pagenumber") {
          if (el.page !== pageNum) return null;
          return renderPageNumber(el);
        }

        if (el.type === "table") {
          const rows = frag.rows || [];
          if (rows.length === 0 && !frag.showHeader) return null;
          return renderTableFragment(
            el,
            rows,
            frag.showHeader ?? true,
            frag.continued ?? false,
            data,
            frag.rowOffset ?? 0,
          );
        }

        if (el.page !== pageNum) return null;

        switch (el.type) {
          case "text":
            return renderText(el, data);
          case "field":
            return renderField(el, data);
          case "image":
            return renderImage(el, data);
          case "shape":
            return renderShape(el, page);
          case "qrcode":
            return renderQRCode(el, data);
          case "barcode":
            return renderBarcode(el, data);
          default:
            return null;
        }
      })
      .filter(Boolean);

    pages.push(
      React.createElement(
        Page,
        {
          key: `page-${pageNum}`,
          size: { width: page.width, height: page.height },
          style: {
            padding: `${page.margin.top}pt ${page.margin.right}pt ${page.margin.bottom}pt ${page.margin.left}pt`,
            backgroundColor: page.background || "#ffffff",
          },
        },
        React.createElement(View, { style: { position: "relative", flex: 1 } }, ...elements),
      ),
    );
  }

  if (pages.length === 0) {
    pages.push(
      React.createElement(
        Page,
        {
          key: "page-1",
          size: { width: page.width, height: page.height },
          style: {
            padding: `${page.margin.top}pt ${page.margin.right}pt ${page.margin.bottom}pt ${page.margin.left}pt`,
            backgroundColor: page.background || "#ffffff",
          },
        },
        React.createElement(View, null),
      ),
    );
  }

  const doc = React.createElement(Document, { title: "Report", author: "Report Flow" }, ...pages);

  await renderToFile(doc, filePath);
}
