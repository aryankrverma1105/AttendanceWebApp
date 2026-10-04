/**
 * Safely extract a string value from req.query.
 * Express types query params as `string | string[] | ParsedQs | ParsedQs[] | undefined`.
 * This helper returns only plain string values (or undefined if anything else).
 */
export function qs(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}
