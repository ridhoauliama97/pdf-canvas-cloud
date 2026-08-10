import { QRCodeSVG } from "qrcode.react";
import { checkCondition, interpolate, resolveElementValue } from "@/lib/template-engine";
import type { CanvasElement, TableColumn } from "@/types/template";
import type { Fragment } from "@/lib/layout-paginate";

function styleToCss(element: CanvasElement): React.CSSProperties {
  const style = element.style;
  return {
    fontFamily: `${style.fontFamily}, Inter, sans-serif`,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? "italic" : "normal",
    color: style.color,
    textAlign: style.align,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
    background: style.background || undefined,
    borderWidth: style.borderWidth || undefined,
    borderStyle: style.borderWidth ? "solid" : undefined,
    borderColor: style.borderColor || "#e5e7eb",
    borderRadius: style.radius || undefined,
    padding: style.padding || undefined,
    textTransform: style.uppercase ? "uppercase" : undefined,
  };
}

function cellValue(column: TableColumn, row: unknown, data: unknown): string {
  return resolveElementValue(
    {
      binding: column.binding,
      ...(column.expression ? { expression: column.expression } : {}),
      ...(column.format ? { format: column.format } : {}),
    },
    data,
    row,
  );
}

function BarcodeMock({ value, color }: { value: string; color: string }) {
  const bars: number[] = [];
  const source = value || "REPORTFLOW";
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    bars.push(1 + (code % 3), 1 + ((code >> 2) % 3), 1 + ((code >> 4) % 2));
  }
  return (
    <div className="flex h-full w-full flex-col justify-between">
      <div className="flex h-full items-stretch gap-[1px] overflow-hidden">
        {bars.map((weight, index) => (
          <span
            key={index}
            style={{
              width: weight,
              background: index % 2 === 0 ? color : "transparent",
            }}
          />
        ))}
      </div>
      <span
        className="text-mono shrink-0 text-center"
        style={{ fontSize: 7, color, letterSpacing: 1 }}
      >
        {source}
      </span>
    </div>
  );
}

export function ElementView({
  fragment,
  data,
  live,
  pageNumber,
  pageCount,
}: {
  fragment: Fragment;
  data: unknown;
  live: boolean;
  pageNumber: number;
  pageCount: number;
}) {
  const element = fragment.element;
  const css = styleToCss(element);

  if (live && !checkCondition(element.visibleIf, data)) return null;

  switch (element.type) {
    case "text":
      return (
        <div style={{ ...css, whiteSpace: "pre-wrap", height: "100%", overflow: "hidden" }}>
          {live ? interpolate(element.text ?? "", data) : (element.text ?? "")}
        </div>
      );

    case "field": {
      const value = live
        ? resolveElementValue(element, data)
        : (element.expression ?? element.binding ?? "");
      return (
        <div style={{ ...css, height: "100%", overflow: "hidden" }}>
          {value || (
            <span style={{ opacity: 0.4 }}>{element.binding ?? element.expression ?? "field"}</span>
          )}
        </div>
      );
    }

    case "pagenumber":
      return (
        <div style={{ ...css, height: "100%" }}>
          {(element.text ?? "Page {{page}} of {{pages}}")
            .replace("{{page}}", String(pageNumber))
            .replace("{{pages}}", String(pageCount))}
        </div>
      );

    case "shape":
      if (element.shape === "line") {
        return (
          <div
            style={{
              height: Math.max(1, element.style.borderWidth ?? 1),
              width: "100%",
              background: element.style.borderColor ?? element.style.color,
            }}
          />
        );
      }
      return (
        <div
          style={{
            ...css,
            height: "100%",
            width: "100%",
            borderRadius: element.shape === "ellipse" ? "50%" : css.borderRadius,
          }}
        />
      );

    case "image": {
      const src = live && element.src ? interpolate(element.src, data) : element.src;
      if (!src) {
        return (
          <div
            className="flex h-full w-full items-center justify-center border border-dashed"
            style={{ borderColor: "#cbd5e1", color: "#94a3b8", fontSize: 10 }}
          >
            image
          </div>
        );
      }
      return (
        <img
          src={src}
          alt={element.name ?? "Template image"}
          style={{
            height: "100%",
            width: "100%",
            objectFit: element.fit ?? "contain",
            borderRadius: css.borderRadius,
          }}
        />
      );
    }

    case "qrcode": {
      const value = live ? interpolate(element.codeValue ?? "", data) : (element.codeValue ?? "");
      return (
        <QRCodeSVG
          value={value || "https://reportflow.dev"}
          size={Math.min(element.w, element.h)}
          bgColor="transparent"
          fgColor={element.style.color}
        />
      );
    }

    case "barcode": {
      const value = live ? interpolate(element.codeValue ?? "", data) : (element.codeValue ?? "");
      return <BarcodeMock value={value} color={element.style.color} />;
    }

    case "table": {
      const columns = element.columns ?? [];
      const totalWidth = columns.reduce((sum, column) => sum + column.width, 0) || 1;
      const rowHeight = element.rowHeight ?? 28;
      const rows = fragment.rows ?? null;
      const placeholderRows = rows
        ? []
        : Array.from({ length: Math.max(1, Math.floor(element.h / rowHeight) - 1) });

      return (
        <div style={{ width: "100%", fontFamily: css.fontFamily, fontSize: css.fontSize }}>
          {fragment.showHeader !== false && (
            <div
              className="flex"
              style={{
                height: rowHeight,
                background: element.headerBackground ?? "#f1f5f9",
                color: element.headerColor ?? "#0f172a",
                fontWeight: 600,
                borderRadius: element.style.radius || undefined,
              }}
            >
              {columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center overflow-hidden px-2"
                  style={{
                    width: `${(column.width / totalWidth) * 100}%`,
                    justifyContent:
                      column.align === "right"
                        ? "flex-end"
                        : column.align === "center"
                          ? "center"
                          : "flex-start",
                  }}
                >
                  <span className="truncate">{column.header}</span>
                </div>
              ))}
            </div>
          )}

          {(rows ?? placeholderRows).map((row, index) => (
            <div
              key={index}
              className="flex"
              style={{
                height: rowHeight,
                color: element.style.color,
                background:
                  element.striped && index % 2 === 1 ? (element.style.background || "#f8fafc") : undefined,
                borderBottom: `${element.style.borderWidth ?? 1}px solid ${element.style.borderColor ?? "#e5e7eb"}`,
              }}
            >
              {columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center overflow-hidden px-2"
                  style={{
                    width: `${(column.width / totalWidth) * 100}%`,
                    justifyContent:
                      column.align === "right"
                        ? "flex-end"
                        : column.align === "center"
                          ? "center"
                          : "flex-start",
                  }}
                >
                  <span className="truncate">
                    {rows ? (
                      cellValue(column, row, data)
                    ) : (
                      <span style={{ opacity: 0.35 }}>{column.binding}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}
