import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { workbookRowsFromRequest } from "../src/xlsx";

describe("workbook import", () => {
  it("reads requested sheet from a combined workbook", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ id: 1, name: "Treatment" }]), "Treatments");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ id: 2, name: "Employee" }]), "Employees");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const form = new FormData();
    form.set("file", new File([bytes], "master-data.xlsx"));

    const result = await workbookRowsFromRequest(new Request("http://local/import", { method: "POST", body: form }), "employees");

    expect(result.rows).toEqual([{ id: 2, name: "Employee" }]);
  });
});
