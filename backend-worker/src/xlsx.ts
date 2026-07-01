import * as XLSX from "xlsx";

export type SheetRow = Record<string, unknown>;

export async function workbookRowsFromRequest(request: Request): Promise<{ filename: string; rows: SheetRow[] }> {
  const form = await request.formData();
  const file = form.get("file") as unknown as { name?: string; arrayBuffer?: () => Promise<ArrayBuffer> } | string | null;
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    throw new Error("File XLSX wajib diunggah.");
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { filename: file.name ?? "import.xlsx", rows: [] };
  return {
    filename: file.name ?? "import.xlsx",
    rows: XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" }),
  };
}

export function makeWorkbook(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.name.slice(0, 31));
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function xlsxResponse(buffer: ArrayBuffer, filename: string): Response {
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function textValue(row: SheetRow, names: string[]): string {
  const value = valueByNames(row, names);
  return value == null ? "" : String(value).trim();
}

export function numberValue(row: SheetRow, names: string[], fallback = 0): number {
  const value = valueByNames(row, names);
  if (value === "" || value == null) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function boolValue(row: SheetRow, names: string[], fallback = false): boolean {
  const value = valueByNames(row, names);
  if (value === "" || value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "ya", "yes", "aktif", "active"].includes(String(value).trim().toLowerCase());
}

export function dateTextValue(row: SheetRow, names: string[]): string {
  const value = valueByNames(row, names);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return value == null ? "" : String(value).trim().slice(0, 10);
}

export function timeTextValue(row: SheetRow, names: string[]): string | null {
  const value = valueByNames(row, names);
  if (value === "" || value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(11, 16);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  return text ? text.slice(0, 5) : null;
}

function valueByNames(row: SheetRow, names: string[]): unknown {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  for (const name of names) {
    if (normalized.has(normalizeKey(name))) return normalized.get(normalizeKey(name));
  }
  return undefined;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
