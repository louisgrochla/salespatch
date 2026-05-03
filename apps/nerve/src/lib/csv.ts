// CSV serialisation. Quotes fields containing commas, quotes, or
// newlines per RFC 4180. Dates → ISO strings. Booleans → true/false.
// null/undefined → empty cell.

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T & string; header?: string }[],
): string {
  const headers = columns.map((c) => c.header ?? c.key);
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(format(row[c.key]))).join(","));
  }
  return lines.join("\n");
}

function format(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join("|");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
