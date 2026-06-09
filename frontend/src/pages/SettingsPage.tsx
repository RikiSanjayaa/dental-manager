import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Field } from "@cloudflare/kumo/components/field";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { DataTable } from "../components/DataTable";
import { dateToString, MultiDatePickerPopover, stringToDate } from "../components/DatePickerPopover";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { isDevelopmentEnvironment } from "../lib/environment";

type PayrollRule = {
  id: number;
  name: string;
  is_default: boolean;
  default_base_salary: number;
  bpjs_jht_rate: number;
  overtime_rate_per_minute: number;
  pph21_threshold: number;
  pph21_rate: number;
  sunday_multiplier: number;
  double_shift_multiplier: number;
};

type DoctorFeeRule = {
  id: number;
  name: string;
  is_default: boolean;
  normal_fee_rate: number;
  ortho_fee_rate: number;
  tax_rate: number;
  default_deduction: number;
};

type AttendanceRule = {
  id: number;
  name: string;
  is_default: boolean;
  timezone1_start: string;
  timezone1_end: string;
  timezone2_start: string;
  timezone2_end: string;
};

type AttendanceHoliday = {
  id: number;
  holiday_date: string;
  name?: string | null;
  is_holiday: boolean;
};

type PayrollDraft = {
  name: string;
  default_base_salary: string;
  bpjs_jht_rate: string;
  overtime_rate_per_minute: string;
  pph21_threshold: string;
  pph21_rate: string;
  sunday_multiplier: string;
  double_shift_multiplier: string;
};

type AttendanceDraft = {
  name: string;
  timezone1_start: string;
  timezone1_end: string;
  timezone2_start: string;
  timezone2_end: string;
};

type DoctorDraft = {
  name: string;
  normal_fee_rate: string;
  ortho_fee_rate: string;
  tax_rate: string;
  default_deduction: string;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function monthBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: dateToString(start), end: dateToString(end), monthDate: start };
}

function defaultBadge(value: boolean) {
  return <Badge variant={value ? "success" : "secondary"}>{value ? "default" : "opsional"}</Badge>;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [holidayPeriod, setHolidayPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [holidayDraftDates, setHolidayDraftDates] = useState<Date[]>([]);
  const [payrollDrafts, setPayrollDrafts] = useState<Record<number, PayrollDraft>>({});
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<number, AttendanceDraft>>({});
  const [doctorDrafts, setDoctorDrafts] = useState<Record<number, DoctorDraft>>({});

  const { data: payrollRules } = useQuery({
    queryKey: ["payroll-rules"],
    queryFn: () => api<PayrollRule[]>("/settings/payroll-rules"),
  });
  const { data: attendanceRules } = useQuery({
    queryKey: ["attendance-rules"],
    queryFn: () => api<AttendanceRule[]>("/settings/attendance-rules"),
  });
  const { data: doctorRules } = useQuery({
    queryKey: ["doctor-fee-rules"],
    queryFn: () => api<DoctorFeeRule[]>("/settings/doctor-fee-rules"),
  });

  const holidayBounds = monthBounds(holidayPeriod);
  const { data: attendanceHolidays } = useQuery({
    queryKey: ["attendance-holidays", holidayPeriod],
    queryFn: () =>
      api<AttendanceHoliday[]>(`/settings/attendance-holidays?start=${holidayBounds.start}&end=${holidayBounds.end}`),
  });

  useEffect(() => {
    const next: Record<number, PayrollDraft> = {};
    for (const rule of payrollRules ?? []) {
      next[rule.id] = {
        name: rule.name,
        default_base_salary: String(rule.default_base_salary),
        bpjs_jht_rate: String(rule.bpjs_jht_rate * 100),
        overtime_rate_per_minute: String(rule.overtime_rate_per_minute),
        pph21_threshold: String(rule.pph21_threshold),
        pph21_rate: String(rule.pph21_rate * 100),
        sunday_multiplier: String(rule.sunday_multiplier),
        double_shift_multiplier: String(rule.double_shift_multiplier),
      };
    }
    setPayrollDrafts(next);
  }, [payrollRules]);

  useEffect(() => {
    const next: Record<number, AttendanceDraft> = {};
    for (const rule of attendanceRules ?? []) {
      next[rule.id] = {
        name: rule.name,
        timezone1_start: rule.timezone1_start.slice(0, 5),
        timezone1_end: rule.timezone1_end.slice(0, 5),
        timezone2_start: rule.timezone2_start.slice(0, 5),
        timezone2_end: rule.timezone2_end.slice(0, 5),
      };
    }
    setAttendanceDrafts(next);
  }, [attendanceRules]);

  useEffect(() => {
    const next: Record<number, DoctorDraft> = {};
    for (const rule of doctorRules ?? []) {
      next[rule.id] = {
        name: rule.name,
        normal_fee_rate: String(rule.normal_fee_rate * 100),
        ortho_fee_rate: String(rule.ortho_fee_rate * 100),
        tax_rate: String(rule.tax_rate * 100),
        default_deduction: String(rule.default_deduction),
      };
    }
    setDoctorDrafts(next);
  }, [doctorRules]);

  useEffect(() => {
    setHolidayDraftDates((attendanceHolidays ?? []).filter((item) => item.is_holiday).map((item) => stringToDate(item.holiday_date)));
  }, [attendanceHolidays]);

  const savePayrollRule = useMutation({
    mutationFn: ({ rule, values }: { rule: PayrollRule; values: PayrollDraft }) =>
      api<PayrollRule>(`/settings/payroll-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: rule.name,
          is_default: rule.is_default,
          default_base_salary: Number(values.default_base_salary || 0),
          bpjs_jht_rate: Number(values.bpjs_jht_rate || 0) / 100,
          overtime_rate_per_minute: Number(values.overtime_rate_per_minute || 0),
          pph21_threshold: Number(values.pph21_threshold || 0),
          pph21_rate: Number(values.pph21_rate || 0) / 100,
          sunday_multiplier: Number(values.sunday_multiplier || 0),
          double_shift_multiplier: Number(values.double_shift_multiplier || 0),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payroll-rules"] });
      await queryClient.invalidateQueries({ queryKey: ["payroll-overview"] });
    },
  });

  const saveAttendanceRule = useMutation({
    mutationFn: ({ rule, values }: { rule: AttendanceRule; values: AttendanceDraft }) =>
      api<AttendanceRule>(`/settings/attendance-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: rule.name,
          is_default: rule.is_default,
          timezone1_start: values.timezone1_start,
          timezone1_end: values.timezone1_end,
          timezone2_start: values.timezone2_start,
          timezone2_end: values.timezone2_end,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance-rules"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  const saveDoctorRule = useMutation({
    mutationFn: ({ rule, values }: { rule: DoctorFeeRule; values: DoctorDraft }) =>
      api<DoctorFeeRule>(`/settings/doctor-fee-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: rule.name,
          is_default: rule.is_default,
          normal_fee_rate: Number(values.normal_fee_rate || 0) / 100,
          ortho_fee_rate: Number(values.ortho_fee_rate || 0) / 100,
          tax_rate: Number(values.tax_rate || 0) / 100,
          default_deduction: Number(values.default_deduction || 0),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["doctor-fee-rules"] });
      await queryClient.invalidateQueries({ queryKey: ["doctor-fee-overview"] });
    },
  });

  const saveAttendanceHoliday = useMutation({
    mutationFn: (payload: { holiday_date: string; is_holiday: boolean; name?: string | null }) =>
      api<AttendanceHoliday>("/settings/attendance-holidays", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance-holidays"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  const deleteAttendanceHoliday = useMutation({
    mutationFn: (id: number) => api(`/settings/attendance-holidays/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance-holidays"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  const refreshDatabase = useMutation({
    mutationFn: () => api<{ status: string; message: string }>("/dev/refresh-database", { method: "POST" }),
    onSuccess: async (result) => {
      setRefreshMessage(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      setRefreshMessage(error instanceof Error ? error.message : "Refresh database gagal.");
    },
  });

  function confirmRefresh() {
    const ok = window.confirm("Refresh database akan menghapus semua data app dan seed ulang admin/default rules. Lanjutkan?");
    if (ok) refreshDatabase.mutate();
  }

  function updatePayrollDraft(id: number, field: keyof PayrollDraft, value: string) {
    setPayrollDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  function updateAttendanceDraft(id: number, field: keyof AttendanceDraft, value: string) {
    setAttendanceDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  function updateDoctorDraft(id: number, field: keyof DoctorDraft, value: string) {
    setDoctorDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  function syncHolidaySelection(nextDates: Date[]) {
    setHolidayDraftDates(nextDates);
    const currentHolidayDates = new Set((attendanceHolidays ?? []).filter((item) => item.is_holiday).map((item) => item.holiday_date));
    const nextHolidayDates = new Set(nextDates.map(dateToString));
    for (const holidayDate of nextHolidayDates) {
      if (!currentHolidayDates.has(holidayDate)) {
        saveAttendanceHoliday.mutate({ holiday_date: holidayDate, is_holiday: true, name: "Tanggal merah" });
      }
    }
    for (const holidayDate of currentHolidayDates) {
      if (!nextHolidayDates.has(holidayDate)) {
        const item = attendanceHolidays?.find((holiday) => holiday.holiday_date === holidayDate && holiday.is_holiday);
        if (item) deleteAttendanceHoliday.mutate(item.id);
      }
    }
  }

  const selectedHolidayDates = (attendanceHolidays ?? []).filter((item) => item.is_holiday).map((item) => stringToDate(item.holiday_date));

  return (
    <>
      <PageHeader title="Pengaturan" eyebrow="Aturan kalkulasi dan preferensi aplikasi" />

      <div className="grid gap-4 xl:grid-cols-3">
        {(payrollRules ?? []).map((rule) => {
          const values = payrollDrafts[rule.id];
          if (!values) return null;
          return (
            <LayerCard key={rule.id}>
              <LayerCard.Secondary className="flex items-start justify-between gap-3">
                <div>
                  <Text as="h2" variant="heading3">Aturan Payroll</Text>
                  <Text variant="secondary" size="sm">Gaji, lembur, BPJS, dan PPh21.</Text>
                </div>
                {defaultBadge(rule.is_default)}
              </LayerCard.Secondary>
              <LayerCard.Primary>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    savePayrollRule.mutate({ rule, values });
                  }}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Field label="Gaji Pokok Default">
                        <Input type="number" value={values.default_base_salary} onChange={(event) => updatePayrollDraft(rule.id, "default_base_salary", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="BPJS JHT (%)">
                        <Input type="number" step="0.01" value={values.bpjs_jht_rate} onChange={(event) => updatePayrollDraft(rule.id, "bpjs_jht_rate", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Tarif Lembur / Menit">
                        <Input type="number" value={values.overtime_rate_per_minute} onChange={(event) => updatePayrollDraft(rule.id, "overtime_rate_per_minute", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Threshold PPh21">
                        <Input type="number" value={values.pph21_threshold} onChange={(event) => updatePayrollDraft(rule.id, "pph21_threshold", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="PPh21 (%)">
                        <Input type="number" step="0.01" value={values.pph21_rate} onChange={(event) => updatePayrollDraft(rule.id, "pph21_rate", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Fee Masuk Libur (x Gaji Harian)">
                        <Input type="number" step="0.001" value={values.sunday_multiplier} onChange={(event) => updatePayrollDraft(rule.id, "sunday_multiplier", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Multiplier Double Shift">
                        <Input type="number" step="0.001" value={values.double_shift_multiplier} onChange={(event) => updatePayrollDraft(rule.id, "double_shift_multiplier", event.target.value)} />
                      </Field>
                    </div>
                  </div>
                  <Button type="submit" variant="primary" loading={savePayrollRule.isPending}>Simpan Perubahan</Button>
                </form>
              </LayerCard.Primary>
            </LayerCard>
          );
        })}

        {(attendanceRules ?? []).map((rule) => {
          const values = attendanceDrafts[rule.id];
          if (!values) return null;
          return (
            <LayerCard key={rule.id}>
              <LayerCard.Secondary className="flex items-start justify-between gap-3">
                <div>
                  <Text as="h2" variant="heading3">Aturan Absensi</Text>
                  <Text variant="secondary" size="sm">Jam kerja dan batas kalkulasi absensi.</Text>
                </div>
                {defaultBadge(rule.is_default)}
              </LayerCard.Secondary>
              <LayerCard.Primary>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveAttendanceRule.mutate({ rule, values });
                  }}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Field label="Timezone I Mulai">
                        <Input type="time" value={values.timezone1_start} onChange={(event) => updateAttendanceDraft(rule.id, "timezone1_start", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Timezone I Selesai">
                        <Input type="time" value={values.timezone1_end} onChange={(event) => updateAttendanceDraft(rule.id, "timezone1_end", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Timezone II Mulai">
                        <Input type="time" value={values.timezone2_start} onChange={(event) => updateAttendanceDraft(rule.id, "timezone2_start", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Timezone II Selesai">
                        <Input type="time" value={values.timezone2_end} onChange={(event) => updateAttendanceDraft(rule.id, "timezone2_end", event.target.value)} />
                      </Field>
                    </div>
                  </div>
                  <Button type="submit" variant="primary" loading={saveAttendanceRule.isPending}>Simpan Perubahan</Button>
                </form>
              </LayerCard.Primary>
            </LayerCard>
          );
        })}

        {(doctorRules ?? []).map((rule) => {
          const values = doctorDrafts[rule.id];
          if (!values) return null;
          return (
            <LayerCard key={rule.id}>
              <LayerCard.Secondary className="flex items-start justify-between gap-3">
                <div>
                  <Text as="h2" variant="heading3">Aturan Fee Dokter</Text>
                  <Text variant="secondary" size="sm">Rate fee, pajak, dan potongan dokter.</Text>
                </div>
                {defaultBadge(rule.is_default)}
              </LayerCard.Secondary>
              <LayerCard.Primary>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveDoctorRule.mutate({ rule, values });
                  }}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Field label="Fee Normal (%)">
                        <Input type="number" step="0.01" value={values.normal_fee_rate} onChange={(event) => updateDoctorDraft(rule.id, "normal_fee_rate", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Fee Ortho (%)">
                        <Input type="number" step="0.01" value={values.ortho_fee_rate} onChange={(event) => updateDoctorDraft(rule.id, "ortho_fee_rate", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Pajak (%)">
                        <Input type="number" step="0.01" value={values.tax_rate} onChange={(event) => updateDoctorDraft(rule.id, "tax_rate", event.target.value)} />
                      </Field>
                    </div>
                    <div>
                      <Field label="Potongan Default">
                        <Input type="number" value={values.default_deduction} onChange={(event) => updateDoctorDraft(rule.id, "default_deduction", event.target.value)} />
                      </Field>
                    </div>
                  </div>
                  <Button type="submit" variant="primary" loading={saveDoctorRule.isPending}>Simpan Perubahan</Button>
                </form>
              </LayerCard.Primary>
            </LayerCard>
          );
        })}
      </div>

      <LayerCard>
        <LayerCard.Secondary className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Text as="h2" variant="heading3">Kalender Libur Absensi</Text>
            <Text variant="secondary" size="sm">Tanggal merah per bulan untuk import absensi dan form manual.</Text>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input type="month" value={holidayPeriod} onChange={(event) => setHolidayPeriod(event.target.value)} className="w-[160px]" />
            <MultiDatePickerPopover
              value={holidayDraftDates}
              onChange={syncHolidaySelection}
              triggerLabel={`Pilih tanggal (${selectedHolidayDates.length})`}
              defaultMonth={holidayBounds.monthDate}
              isDateDisabled={(date) => dateToString(date).slice(0, 7) !== holidayPeriod}
            />
            <Badge variant="secondary">{selectedHolidayDates.length} tanggal</Badge>
          </div>
        </LayerCard.Secondary>
        <LayerCard.Primary>
          <DataTable
            rows={attendanceHolidays ?? []}
            empty="Belum ada tanggal khusus untuk bulan ini."
            minTableWidth={860}
            rowKey={(row) => row.id}
            columns={[
              { key: "date", header: "Tanggal", render: (row) => row.holiday_date },
              { key: "type", header: "Status", render: (row) => <Badge variant={row.is_holiday ? "error" : "success"}>{row.is_holiday ? "Libur" : "Hari biasa"}</Badge> },
              {
                key: "name",
                header: "Keterangan",
                render: (row) => (
                  <Input
                    defaultValue={row.name ?? ""}
                    placeholder="Keterangan"
                    onBlur={(event) => {
                      const nextName = event.target.value.trim() || null;
                      if ((row.name ?? null) === nextName) return;
                      saveAttendanceHoliday.mutate({ holiday_date: row.holiday_date, is_holiday: row.is_holiday, name: nextName });
                    }}
                  />
                ),
              },
              {
                key: "actions",
                header: "",
                align: "right",
                sticky: "right",
                render: (row) => (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" icon={<CalendarDays size={16} />} loading={saveAttendanceHoliday.isPending} onClick={() => saveAttendanceHoliday.mutate({ holiday_date: row.holiday_date, is_holiday: !row.is_holiday, name: row.is_holiday ? "Jadwal masuk" : "Tanggal merah" })}>
                      {row.is_holiday ? "Jadikan biasa" : "Jadikan libur"}
                    </Button>
                    <Button size="sm" variant="secondary-destructive" shape="square" aria-label="Hapus override libur" loading={deleteAttendanceHoliday.isPending} onClick={() => deleteAttendanceHoliday.mutate(row.id)}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </LayerCard.Primary>
      </LayerCard>

      {isDevelopmentEnvironment ? (
        <LayerCard>
          <LayerCard.Secondary>
            <Text as="h2" variant="heading3">Developer Tools</Text>
            <Text variant="secondary" size="sm">Refresh database menghapus semua data app, lalu membuat ulang admin dan default rules.</Text>
            {refreshMessage ? <Text variant="error" size="sm">{refreshMessage}</Text> : null}
          </LayerCard.Secondary>
          <LayerCard.Primary className="flex justify-end">
            <Button variant="secondary-destructive" icon={<RefreshCcw size={18} />} loading={refreshDatabase.isPending} onClick={confirmRefresh}>
              Refresh Database
            </Button>
          </LayerCard.Primary>
        </LayerCard>
      ) : null}
    </>
  );
}
