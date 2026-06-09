import type { AttendanceRecord, AttendanceValues } from "./types";

export function emptyAttendanceValues(period: string): AttendanceValues {
  return {
    period,
    employee_id: "",
    attendance_id_snapshot: "",
    employee_name_snapshot: "",
    work_date: `${period}-01`,
    timezone1_in: "",
    timezone1_out: "",
    timezone2_in: "",
    timezone2_out: "",
    status_note: "",
    is_holiday: "false",
    needs_review: "false",
  };
}

export function toInputTime(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

export function valuesFromAttendance(row: AttendanceRecord): AttendanceValues {
  return {
    period: row.period,
    employee_id: row.employee_id ? String(row.employee_id) : "",
    attendance_id_snapshot: row.attendance_id_snapshot ?? "",
    employee_name_snapshot: row.employee_name_snapshot,
    work_date: row.work_date,
    timezone1_in: toInputTime(row.timezone1_in),
    timezone1_out: toInputTime(row.timezone1_out),
    timezone2_in: toInputTime(row.timezone2_in),
    timezone2_out: toInputTime(row.timezone2_out),
    status_note: row.status_note ?? "",
    is_holiday: String(row.is_holiday),
    needs_review: String(row.needs_review),
  };
}

export function attendancePayload(values: AttendanceValues) {
  return {
    period: values.period || undefined,
    employee_id: values.employee_id ? Number(values.employee_id) : null,
    attendance_id_snapshot: values.attendance_id_snapshot.trim() || null,
    employee_name_snapshot: values.employee_name_snapshot.trim(),
    work_date: values.work_date,
    timezone1_in: values.timezone1_in || null,
    timezone1_out: values.timezone1_out || null,
    timezone2_in: values.timezone2_in || null,
    timezone2_out: values.timezone2_out || null,
    is_holiday: values.is_holiday === "true",
    status_note: values.status_note.trim() || null,
    needs_review: values.needs_review === "true",
  };
}

export function includesText(value: unknown, search: string) {
  return String(value ?? "").toLowerCase().includes(search.trim().toLowerCase());
}
