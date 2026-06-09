import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Field } from "@cloudflare/kumo/components/field";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import { Switch } from "@cloudflare/kumo/components/switch";

import { DatePickerPopover } from "../DatePickerPopover";
import type { EditorSession, Employee } from "./types";

type Props = {
  editor: EditorSession;
  employees: Employee[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldChange: (field: string, value: string) => void;
  onSubmit: () => void;
};

function minutesOf(value: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function diff(later: string, earlier: string) {
  const l = minutesOf(later);
  const e = minutesOf(earlier);
  if (l === null || e === null) return 0;
  return Math.max(l - e, 0);
}

function preview(values: EditorSession["values"]) {
  const hasAnyTime = Boolean(values.timezone1_in || values.timezone1_out || values.timezone2_in || values.timezone2_out);
  const isDayOff = values.is_holiday === "true";
  if (!hasAnyTime) return { late: 0, early: 0, isAbsent: !isDayOff, isDayOff, absentMinutes: isDayOff ? 0 : 480, total: 0, overtime: 0 };
  if (isDayOff) {
    const overtime = diff(values.timezone1_out, values.timezone1_in) + diff(values.timezone2_out, values.timezone2_in);
    return { late: 0, early: 0, isAbsent: false, isDayOff, absentMinutes: 0, total: 0, overtime };
  }
  const late = diff(values.timezone1_in, "08:00") + diff(values.timezone2_in, "14:00");
  const early = diff("16:00", values.timezone1_out) + diff("21:00", values.timezone2_out);
  const overtime = diff(values.timezone1_out, "16:00") + diff(values.timezone2_out, "21:00");
  return { late, early, isAbsent: false, isDayOff, absentMinutes: 0, total: late + early, overtime };
}

export function AttendanceEditorDialog({
  editor,
  employees,
  isSaving,
  onOpenChange,
  onFieldChange,
  onSubmit,
}: Props) {
  const values = editor.values;
  const needsReview = values.needs_review === "true";
  const isHoliday = values.is_holiday === "true";
  const totals = preview(values);

  function chooseEmployee(value: string) {
    if (value === "manual") {
      onFieldChange("employee_id", "");
      return;
    }
    const employee = employees.find((item) => String(item.id) === value);
    onFieldChange("employee_id", value);
    if (!values.employee_name_snapshot.trim()) {
      onFieldChange("employee_name_snapshot", employee?.name ?? values.employee_name_snapshot);
    }
    onFieldChange("attendance_id_snapshot", employee?.attendance_id ?? values.attendance_id_snapshot);
  }

  return (
    <Dialog.Root open={editor.open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="p-0" style={{ height: "95vh", maxHeight: "95vh", overflow: "hidden" }}>
        <form
          className="flex h-full min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="border-b border-kumo-hairline px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-bold">
                  {editor.mode === "edit" ? "Edit" : "Tambah"} Absensi
                </Dialog.Title>
                <Dialog.Description>
                  Input jam fingerprint final untuk sumber kalkulasi payroll.
                </Dialog.Description>
              </div>
              <Badge variant={editor.mode === "edit" ? "secondary" : "success"}>
                {editor.mode === "edit" ? "Edit data" : "Data baru"}
              </Badge>
            </div>
          </div>

          <div className="px-6 py-4" style={{ minHeight: 0, flex: "1 1 0%", overflow: "auto" }}>
            <Grid variant="2up" gap="sm">
              <Field label="Periode" labelTooltip="Bulan absensi untuk payroll, format YYYY-MM. Jika kosong, backend memakai bulan dari tanggal kerja.">
                <Input type="month" required value={values.period} onChange={(event) => onFieldChange("period", event.target.value)} />
              </Field>
              <Field label="Tanggal" labelTooltip="Tanggal kerja pada baris absensi.">
                <DatePickerPopover value={values.work_date} onChange={(value) => onFieldChange("work_date", value)} />
              </Field>
              <Field label="Karyawan" labelTooltip="Karyawan dari Master Data. ID Absensi dan nama snapshot akan diisi otomatis dari pilihan ini.">
                <Select
                  aria-label="Karyawan"
                  value={values.employee_id || "manual"}
                  renderValue={(value) => {
                    if (value === "manual") return "Manual / belum match";
                    return employees.find((item) => String(item.id) === value)?.name ?? "Pilih karyawan";
                  }}
                  onValueChange={(value) => chooseEmployee(String(value))}
                >
                  <Select.Option value="manual">Manual / belum match</Select.Option>
                  {employees.map((employee) => (
                    <Select.Option key={employee.id} value={String(employee.id)}>
                      {employee.attendance_id ? `${employee.attendance_id} - ${employee.name}` : employee.name}
                    </Select.Option>
                  ))}
                </Select>
              </Field>
              <Field label="ID Absensi" labelTooltip="ID fingerprint yang tersimpan sebagai snapshot untuk baris absensi ini." required={false}>
                <Input value={values.attendance_id_snapshot} onChange={(event) => onFieldChange("attendance_id_snapshot", event.target.value)} />
              </Field>
              <GridItem className="md:col-span-2" style={{ gridColumn: "1 / -1" }}>
                <Field label="Nama Panggilan" labelTooltip="Nama dari file absensi atau nama panggilan yang ingin tampil di absensi. ID Absensi tetap dipakai untuk mencocokkan ke master karyawan.">
                  <Input required value={values.employee_name_snapshot} onChange={(event) => onFieldChange("employee_name_snapshot", event.target.value)} />
                </Field>
              </GridItem>
              <Field label="Timezone I Masuk" labelTooltip="Jam masuk shift/timezone pertama. Default jadwal: 08:00.">
                <Input type="time" value={values.timezone1_in} onChange={(event) => onFieldChange("timezone1_in", event.target.value)} />
              </Field>
              <Field label="Timezone I Keluar" labelTooltip="Jam keluar shift/timezone pertama. Default jadwal: 16:00.">
                <Input type="time" value={values.timezone1_out} onChange={(event) => onFieldChange("timezone1_out", event.target.value)} />
              </Field>
              <Field label="Timezone II Masuk" labelTooltip="Jam masuk shift/timezone kedua. Default jadwal: 14:00.">
                <Input type="time" value={values.timezone2_in} onChange={(event) => onFieldChange("timezone2_in", event.target.value)} />
              </Field>
              <Field label="Timezone II Keluar" labelTooltip="Jam keluar shift/timezone kedua. Default jadwal: 21:00.">
                <Input type="time" value={values.timezone2_out} onChange={(event) => onFieldChange("timezone2_out", event.target.value)} />
              </Field>
              <GridItem className="md:col-span-2" style={{ gridColumn: "1 / -1" }}>
                <Field label="Catatan" labelTooltip="Catatan opsional untuk HR/payroll, misalnya izin, sakit, tukar shift, atau perlu koreksi manual." required={false}>
                  <Input value={values.status_note} onChange={(event) => onFieldChange("status_note", event.target.value)} />
                </Field>
              </GridItem>
              <GridItem className="md:col-span-2" style={{ gridColumn: "1 / -1" }}>
                <Switch
                  size="sm"
                  variant="neutral"
                  label="Hari libur / tanggal merah"
                  labelTooltip="Nyalakan jika tanggal ini libur. Hari Minggu otomatis dianggap libur meski switch ini mati."
                  checked={isHoliday}
                  onCheckedChange={(checked) => onFieldChange("is_holiday", checked ? "true" : "false")}
                />
              </GridItem>
              <div style={{ gridColumn: "1 / -1", width: "100%" }}>
                <div className="rounded-lg border border-kumo-hairline bg-kumo-base px-4 py-3">
                  <div className="mb-2 text-sm font-semibold text-kumo-default">Preview Kalkulasi</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Preview label="Terlambat" value={`${totals.late} min`} />
                    <Preview label="Pulang Awal" value={`${totals.early} min`} />
                    <Preview
                      label="Status"
                      value={totals.isAbsent ? "Tidak hadir" : totals.isDayOff ? (totals.overtime ? "Lembur" : "Libur") : "Hadir"}
                      tone={totals.isAbsent ? "danger" : totals.overtime ? "success" : "default"}
                    />
                    <Preview label="Total" value={`${totals.total} min`} tone="info" strong className="md:col-span-2" />
                    <Preview label="Lembur" value={`${totals.overtime} min`} tone="success" />
                  </div>
                </div>
              </div>
            </Grid>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                variant="neutral"
                label="Perlu review"
                labelTooltip="Nyalakan jika absensi perlu dicek sebelum payroll dihitung atau dilock."
                checked={needsReview}
                onCheckedChange={(checked) => onFieldChange("needs_review", checked ? "true" : "false")}
              />
              <Badge variant={needsReview ? "error" : "success"}>{needsReview ? "Review" : "OK"}</Badge>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={(props) => <Button {...props} variant="secondary" type="button">Batal</Button>} />
              <Button variant="primary" type="submit" loading={isSaving} disabled={!values.employee_name_snapshot.trim()}>
                Simpan
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}

function Preview({
  label,
  value,
  strong = false,
  tone = "default",
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "default" | "success" | "danger" | "info";
  className?: string;
}) {
  const toneClass =
    tone === "success" ? "text-kumo-success" :
    tone === "danger" ? "text-kumo-danger" :
    tone === "info" ? "text-kumo-info" :
    "text-kumo-default";
  return (
    <div className={`rounded-md bg-kumo-canvas px-3 py-2 ${className}`}>
      <div className="text-xs font-medium text-kumo-subtle">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneClass} ${strong ? "text-base" : ""}`}>{value}</div>
    </div>
  );
}
