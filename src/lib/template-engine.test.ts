import { describe, it, expect } from "vitest";
import {
  getPath,
  formatValue,
  evaluateExpression,
  interpolate,
  checkCondition,
  deriveSchema,
  resolveElementValue,
} from "./template-engine";

describe("getPath", () => {
  it("reads a simple top-level key", () => {
    expect(getPath({ a: 1 }, "a")).toBe(1);
  });

  it("reads a nested dotted path", () => {
    expect(getPath({ customer: { name: "Budi" } }, "customer.name")).toBe("Budi");
  });

  it("reads an array index path (items[0].qty)", () => {
    expect(getPath({ items: [{ qty: 5 }] }, "items[0].qty")).toBe(5);
  });

  it("returns undefined for a missing path", () => {
    expect(getPath({ a: 1 }, "b.c")).toBeUndefined();
  });

  it("returns undefined for an empty path", () => {
    expect(getPath({ a: 1 }, "")).toBeUndefined();
  });

  it("does not throw when traversing through null", () => {
    expect(getPath({ a: null }, "a.b")).toBeUndefined();
  });
});

describe("formatValue", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(formatValue(null)).toBe("");
    expect(formatValue(undefined)).toBe("");
    expect(formatValue("")).toBe("");
  });

  it("formats currency IDR with 0 decimals by default", () => {
    const out = formatValue(15000, { type: "currency", currency: "IDR" });
    // Should contain the number grouped (15.000) — locale id-ID uses '.' as group sep.
    expect(out).toContain("15.000");
  });

  it("formats currency USD with 2 decimals by default", () => {
    const out = formatValue(19.5, { type: "currency", currency: "USD" });
    expect(out).toContain("19.50");
  });

  it("respects explicit precision override", () => {
    const out = formatValue(1000, { type: "currency", currency: "IDR", precision: 2 });
    expect(out).toContain("1.000,00");
  });

  it("formats plain numbers with id-ID grouping", () => {
    expect(formatValue(1234, { type: "number" })).toBe("1.234");
  });

  it("falls back to String(value) for non-numeric currency/number input", () => {
    expect(formatValue("abc", { type: "number" })).toBe("abc");
  });

  it("formats dates in DD/MM/YYYY by default", () => {
    expect(formatValue("2026-01-05", { type: "date" })).toBe("05/01/2026");
  });

  it("formats dates in YYYY-MM-DD", () => {
    expect(formatValue("2026-01-05", { type: "date", dateFormat: "YYYY-MM-DD" })).toBe(
      "2026-01-05",
    );
  });

  it("formats dates in DD MMM YYYY", () => {
    expect(formatValue("2026-01-05", { type: "date", dateFormat: "DD MMM YYYY" })).toBe(
      "05 Jan 2026",
    );
  });

  it("returns the raw string for an invalid date", () => {
    expect(formatValue("not-a-date", { type: "date" })).toBe("not-a-date");
  });

  it("applies prefix and suffix", () => {
    expect(formatValue(5, { type: "number", prefix: ">> ", suffix: " units" })).toBe(">> 5 units");
  });

  it("stringifies plain objects for type text", () => {
    expect(formatValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
  });
});

describe("evaluateExpression", () => {
  it("evaluates simple arithmetic", () => {
    expect(evaluateExpression("2 + 3", {})).toBe(5);
  });

  it("respects operator precedence (* before +)", () => {
    expect(evaluateExpression("2 + 3 * 4", {})).toBe(14);
  });

  it("respects parentheses", () => {
    expect(evaluateExpression("(2 + 3) * 4", {})).toBe(20);
  });

  it("resolves variable paths from scope (row-level, e.g. qty * unit_price)", () => {
    const row = { qty: 3, unit_price: 1000 };
    expect(evaluateExpression("qty * unit_price", row)).toBe(3000);
  });

  it("falls back to root data when a path is missing from scope", () => {
    const scope = { qty: 2 };
    const root = { taxRate: 0.1 };
    expect(evaluateExpression("qty * taxRate", scope, root)).toBeCloseTo(0.2);
  });

  it("treats an unresolved variable as 0", () => {
    expect(evaluateExpression("missing + 5", {})).toBe(5);
  });

  it("returns 0 for division by zero instead of NaN/Infinity", () => {
    expect(evaluateExpression("10 / 0", {})).toBe(0);
  });

  it("returns undefined for a garbage expression with no matchable tokens", () => {
    expect(evaluateExpression("@@@", {})).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("replaces a single merge tag", () => {
    expect(interpolate("Hello {{name}}", { name: "Budi" })).toBe("Hello Budi");
  });

  it("replaces multiple merge tags", () => {
    expect(interpolate("{{a}} + {{b}}", { a: 1, b: 2 })).toBe("1 + 2");
  });

  it("replaces missing paths with empty string (not 'undefined')", () => {
    expect(interpolate("Hello {{missing}}", {})).toBe("Hello ");
  });

  it("prefers scope over root data when both are provided", () => {
    expect(interpolate("{{name}}", { name: "root" }, { name: "row" })).toBe("row");
  });

  it("supports nested paths inside merge tags", () => {
    expect(interpolate("{{customer.name}}", { customer: { name: "Ani" } })).toBe("Ani");
  });
});

describe("checkCondition", () => {
  it("is visible (true) when no condition is set", () => {
    expect(checkCondition(undefined, {})).toBe(true);
  });

  it("truthy: hides when value is 0", () => {
    expect(checkCondition({ path: "discount", op: "truthy" }, { discount: 0 })).toBe(false);
  });

  it("truthy: hides when value is the string '0'", () => {
    expect(checkCondition({ path: "discount", op: "truthy" }, { discount: "0" })).toBe(false);
  });

  it("truthy: shows for a positive number", () => {
    expect(checkCondition({ path: "discount", op: "truthy" }, { discount: 500 })).toBe(true);
  });

  it("falsy: shows when value is missing", () => {
    expect(checkCondition({ path: "discount", op: "falsy" }, {})).toBe(true);
  });

  it("eq compares as strings", () => {
    expect(checkCondition({ path: "status", op: "eq", value: "paid" }, { status: "paid" })).toBe(
      true,
    );
  });

  it("gt/lt compare numerically", () => {
    expect(checkCondition({ path: "qty", op: "gt", value: "5" }, { qty: 10 })).toBe(true);
    expect(checkCondition({ path: "qty", op: "lt", value: "5" }, { qty: 10 })).toBe(false);
  });
});

describe("deriveSchema", () => {
  it("derives primitive field types", () => {
    const schema = deriveSchema({ name: "Budi", age: 30, active: true });
    expect(schema).toContainEqual({ path: "name", type: "string" });
    expect(schema).toContainEqual({ path: "age", type: "number" });
    expect(schema).toContainEqual({ path: "active", type: "boolean" });
  });

  it("detects ISO date-like strings as type 'date'", () => {
    const schema = deriveSchema({ issuedAt: "2026-08-12" });
    expect(schema).toContainEqual({ path: "issuedAt", type: "date" });
  });

  it("derives array item fields with a [] suffix on the path", () => {
    const schema = deriveSchema({ items: [{ qty: 1 }] });
    expect(schema).toContainEqual({ path: "items", type: "array" });
    expect(schema).toContainEqual({ path: "items[].qty", type: "number" });
  });

  it("recurses into nested objects", () => {
    const schema = deriveSchema({ customer: { name: "Budi" } });
    expect(schema).toContainEqual({ path: "customer", type: "object" });
    expect(schema).toContainEqual({ path: "customer.name", type: "string" });
  });

  it("stops recursing past depth 4 to avoid runaway/cyclic structures", () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    const schema = deriveSchema(deep);
    const paths = schema.map((f) => f.path);
    expect(paths).not.toContain("a.b.c.d.e.f");
  });
});

describe("resolveElementValue", () => {
  it("prioritizes expression over binding/text", () => {
    const out = resolveElementValue(
      { expression: "qty * price", binding: "ignored", text: "ignored" },
      {},
      { qty: 2, price: 100 },
    );
    expect(out).toBe("200");
  });

  it("falls back to binding when no expression is set (no format = plain text)", () => {
    const out = resolveElementValue({ binding: "total" }, { total: 5000 }, undefined);
    expect(out).toBe("5000");
  });

  it("applies the given format when falling back to binding", () => {
    const out = resolveElementValue(
      { binding: "total", format: { type: "number" } },
      { total: 5000 },
      undefined,
    );
    expect(out).toBe("5.000");
  });

  it("falls back to text/interpolation when neither expression nor binding is set", () => {
    const out = resolveElementValue({ text: "Hi {{name}}" }, { name: "Budi" });
    expect(out).toBe("Hi Budi");
  });

  it("returns empty string when nothing is configured", () => {
    expect(resolveElementValue({}, {})).toBe("");
  });
});
