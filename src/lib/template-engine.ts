import type { Condition, SchemaField, ValueFormat } from "@/types/template";

/** Read a dotted path (supports `items[0].qty`) out of a data object. */
export function getPath(data: unknown, path: string): unknown {
  if (!path) return undefined;
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current: unknown = data;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const CURRENCY_LOCALES: Record<string, string> = {
  IDR: "id-ID",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  SGD: "en-SG",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: unknown, pattern: ValueFormat["dateFormat"]): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  switch (pattern) {
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "DD MMM YYYY":
      return `${dd} ${MONTHS[date.getMonth()]} ${yyyy}`;
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

export function formatValue(value: unknown, format?: ValueFormat): string {
  if (value === null || value === undefined || value === "") return "";
  const type = format?.type ?? "text";
  let out: string;

  if (type === "currency") {
    const currency = format?.currency ?? "IDR";
    const precision = format?.precision ?? (currency === "IDR" ? 0 : 2);
    const numeric = Number(value);
    out = Number.isFinite(numeric)
      ? new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
          style: "currency",
          currency,
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        }).format(numeric)
      : String(value);
  } else if (type === "number") {
    const precision = format?.precision ?? 0;
    const numeric = Number(value);
    out = Number.isFinite(numeric)
      ? new Intl.NumberFormat("id-ID", {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        }).format(numeric)
      : String(value);
  } else if (type === "date") {
    out = formatDate(value, format?.dateFormat ?? "DD/MM/YYYY");
  } else {
    out = typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  return `${format?.prefix ?? ""}${out}${format?.suffix ?? ""}`;
}

/**
 * Evaluate a tiny arithmetic expression over variable paths.
 * Supports + - * / ( ) numbers and dotted paths. No JS execution.
 */
export function evaluateExpression(
  expression: string,
  scope: unknown,
  root?: unknown,
): number | undefined {
  const tokens = expression.match(/([A-Za-z_][\w.[\]]*)|(\d+(?:\.\d+)?)|([+\-*/()])/g);
  if (!tokens) return undefined;

  const resolved = tokens.map((token) => {
    if (/^[A-Za-z_]/.test(token)) {
      const value =
        getPath(scope, token) ?? (root !== undefined ? getPath(root, token) : undefined);
      const numeric = Number(value);
      return Number.isFinite(numeric) ? String(numeric) : "0";
    }
    return token;
  });

  let index = 0;
  const peek = () => resolved[index];
  const next = () => resolved[index++];

  const parseExpr = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const right = parseFactor();
      value = op === "*" ? value * right : right === 0 ? 0 : value / right;
    }
    return value;
  };
  const parseFactor = (): number => {
    const token = next();
    if (token === "(") {
      const value = parseExpr();
      if (peek() === ")") next();
      return value;
    }
    if (token === "-") return -parseFactor();
    const numeric = Number(token);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const result = parseExpr();
  return Number.isFinite(result) ? result : undefined;
}

/** Replace {{merge.tags}} inside a text string. */
export function interpolate(text: string, data: unknown, scope?: unknown): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
    const value =
      scope !== undefined ? (getPath(scope, path) ?? getPath(data, path)) : getPath(data, path);
    return value === undefined || value === null ? "" : String(value);
  });
}

export function checkCondition(condition: Condition | undefined, data: unknown): boolean {
  if (!condition || !condition.path) return true;
  const value = getPath(data, condition.path);
  switch (condition.op) {
    case "truthy":
      return Boolean(value) && value !== 0 && value !== "0";
    case "falsy":
      return !value || value === 0 || value === "0";
    case "eq":
      return String(value ?? "") === String(condition.value ?? "");
    case "neq":
      return String(value ?? "") !== String(condition.value ?? "");
    case "gt":
      return Number(value) > Number(condition.value ?? 0);
    case "lt":
      return Number(value) < Number(condition.value ?? 0);
    default:
      return true;
  }
}

/** Derive a flat, bindable field list from a sample JSON payload. */
export function deriveSchema(data: unknown, prefix = "", depth = 0): SchemaField[] {
  if (depth > 4 || data === null || typeof data !== "object") return [];
  const fields: SchemaField[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      fields.push({ path, type: "array" });
      if (value.length && typeof value[0] === "object" && value[0] !== null) {
        for (const field of deriveSchema(value[0], `${path}[]`, depth + 1)) fields.push(field);
      }
    } else if (value !== null && typeof value === "object") {
      fields.push({ path, type: "object" });
      for (const field of deriveSchema(value, path, depth + 1)) fields.push(field);
    } else {
      fields.push({
        path,
        type:
          typeof value === "number"
            ? "number"
            : typeof value === "boolean"
              ? "boolean"
              : /^\d{4}-\d{2}-\d{2}/.test(String(value))
                ? "date"
                : "string",
      });
    }
  }
  return fields;
}

/** Resolve the display string for a bound element. */
export function resolveElementValue(
  options: { binding?: string; expression?: string; text?: string; format?: ValueFormat },
  data: unknown,
  scope?: unknown,
): string {
  if (options.expression) {
    const value = evaluateExpression(options.expression, scope ?? data, data);
    return formatValue(value, options.format ?? { type: "number" });
  }
  if (options.binding) {
    const value =
      scope !== undefined
        ? (getPath(scope, options.binding) ?? getPath(data, options.binding))
        : getPath(data, options.binding);
    return formatValue(value, options.format);
  }
  if (options.text) return interpolate(options.text, data, scope);
  return "";
}
