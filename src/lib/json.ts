/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cast an app-level object to the database `Json` column type.
 * Layout/schema/sample-data are stored as jsonb, and the generated types use a
 * structural `Json` union that rejects interfaces without index signatures.
 */
export function jsonValue(value: unknown): any {
  return value;
}
