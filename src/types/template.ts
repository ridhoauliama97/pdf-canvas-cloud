export type ElementType =
  | "text"
  | "field"
  | "table"
  | "image"
  | "shape"
  | "qrcode"
  | "barcode"
  | "pagenumber";

export type FormatType = "text" | "currency" | "number" | "date";

export interface ValueFormat {
  type: FormatType;
  precision?: number;
  currency?: string;
  dateFormat?: "DD/MM/YYYY" | "YYYY-MM-DD" | "DD MMM YYYY";
  prefix?: string;
  suffix?: string;
}

export interface Condition {
  path: string;
  op: "truthy" | "falsy" | "eq" | "neq" | "gt" | "lt";
  value?: string;
}

export interface TableColumn {
  id: string;
  header: string;
  /** relative path inside each array item, or an expression when `expression` is set */
  binding: string;
  expression?: string;
  width: number;
  align: "left" | "center" | "right";
  format?: ValueFormat;
}

export interface ElementStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic?: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: number;
  background?: string;
  borderWidth?: number;
  borderColor?: string;
  radius?: number;
  padding?: number;
  uppercase?: boolean;
}

export interface CanvasElement {
  id: string;
  type: ElementType;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  locked?: boolean;
  style: ElementStyle;
  /** text with optional {{merge.tags}} */
  text?: string;
  /** single variable binding for field elements */
  binding?: string;
  expression?: string;
  format?: ValueFormat;
  visibleIf?: Condition;
  /** table */
  arrayBinding?: string;
  columns?: TableColumn[];
  rowHeight?: number;
  headerBackground?: string;
  headerColor?: string;
  striped?: boolean;
  showHeader?: boolean;
  /** image */
  src?: string;
  fit?: "contain" | "cover";
  /** shape */
  shape?: "rect" | "line" | "ellipse";
  /** code blocks */
  codeValue?: string;
}

export type PageFormat = "A4" | "Letter" | "Custom";

export interface PageSetup {
  format: PageFormat;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  pageCount: number;
  background: string;
}

export interface SchemaField {
  path: string;
  type: "string" | "number" | "boolean" | "date" | "array" | "object";
}

export interface TemplateLayout {
  elements: CanvasElement[];
}

export interface TemplateDoc {
  page: PageSetup;
  layout: TemplateLayout;
  sampleData: Record<string, unknown>;
  schema: SchemaField[];
}

/** Page pixel sizes at 96dpi. */
export const PAGE_SIZES: Record<Exclude<PageFormat, "Custom">, { width: number; height: number }> = {
  A4: { width: 794, height: 1123 },
  Letter: { width: 816, height: 1056 },
};

export const DEFAULT_STYLE: ElementStyle = {
  fontFamily: "Inter",
  fontSize: 12,
  fontWeight: 400,
  color: "#1f2937",
  align: "left",
  lineHeight: 1.4,
  padding: 0,
};

export function defaultPage(format: PageFormat = "A4"): PageSetup {
  const size = format === "Letter" ? PAGE_SIZES.Letter : PAGE_SIZES.A4;
  return {
    format,
    width: size.width,
    height: size.height,
    margin: { top: 48, right: 48, bottom: 56, left: 48 },
    pageCount: 1,
    background: "#ffffff",
  };
}
