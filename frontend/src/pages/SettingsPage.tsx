import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Field } from "@cloudflare/kumo/components/field";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { DataTable } from "../components/DataTable";
import {
  dateToString,
  MultiDatePickerPopover,
  stringToDate,
} from "../components/DatePickerPopover";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { isDevelopmentEnvironment } from "../lib/environment";

type PayrollRule = {
  id: number;
  name: string;
  is_default: boolean;
  bpjs_jht_rate: number;
  overtime_rate_per_minute: number;
  pph21_threshold: number;
  pph21_rate: number;
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

function monthBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: dateToString(start), end: dateToString(end), monthDate: start };
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [holidayPeriod, setHolidayPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [attendanceEditor, setAttendanceEditor] = useState<{
    open: boolean;
    rule?: AttendanceRule;
    values: {
      name: string;
      timezone1_start: string;
      timezone1_end: string;
      timezone2_start: string;
      timezone2_end: string;
    };
  }>({
    open: false,
    values: {
      name: "",
      timezone1_start: "08:00",
      timezone1_end: "16:00",
      timezone2_start: "14:00",
      timezone2_end: "21:00",
    },
  });
  const [holidayDraftDates, setHolidayDraftDates] = useState<Date[]>([]);
  const { data: payrollRules } = useQuery({
    queryKey: ["payroll-rules"],
    queryFn: () => api<PayrollRule[]>("/settings/payroll-rules"),
  });
  const { data: attendanceRules } = useQuery({
    queryKey: ["attendance-rules"],
    queryFn: () => api<AttendanceRule[]>("/settings/attendance-rules"),
  });
  const holidayBounds = monthBounds(holidayPeriod);
  const { data: attendanceHolidays } = useQuery({
    queryKey: ["attendance-holidays", holidayPeriod],
    queryFn: () =>
      api<AttendanceHoliday[]>(
        `/settings/attendance-holidays?start=${holidayBounds.start}&end=${holidayBounds.end}`,
      ),
  });
  const { data: doctorRules } = useQuery({
    queryKey: ["doctor-fee-rules"],
    queryFn: () => api<DoctorFeeRule[]>("/settings/doctor-fee-rules"),
  });
  const refreshDatabase = useMutation({
    mutationFn: () =>
      api<{ status: string; message: string }>("/dev/refresh-database", {
        method: "POST",
      }),
    onSuccess: async (result) => {
      setRefreshMessage(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      setRefreshMessage(
        error instanceof Error ? error.message : "Refresh database gagal.",
      );
    },
  });
  const saveAttendanceRule = useMutation({
    mutationFn: () =>
      api<AttendanceRule>(
        `/settings/attendance-rules/${attendanceEditor.rule?.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: attendanceEditor.values.name,
            is_default: attendanceEditor.rule?.is_default ?? true,
            timezone1_start: attendanceEditor.values.timezone1_start,
            timezone1_end: attendanceEditor.values.timezone1_end,
            timezone2_start: attendanceEditor.values.timezone2_start,
            timezone2_end: attendanceEditor.values.timezone2_end,
          }),
        },
      ),
    onSuccess: async () => {
      setAttendanceEditor((current) => ({ ...current, open: false }));
      await queryClient.invalidateQueries({ queryKey: ["attendance-rules"] });
    },
  });
  const saveAttendanceHoliday = useMutation({
    mutationFn: (payload: {
      holiday_date: string;
      is_holiday: boolean;
      name?: string | null;
    }) =>
      api<AttendanceHoliday>("/settings/attendance-holidays", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["attendance-holidays"],
      });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
  const deleteAttendanceHoliday = useMutation({
    mutationFn: (id: number) =>
      api(`/settings/attendance-holidays/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["attendance-holidays"],
      });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });

  function confirmRefresh() {
    const ok = window.confirm(
      "Refresh database akan menghapus semua data app dan seed ulang admin/default rules. Lanjutkan?",
    );
    if (ok) refreshDatabase.mutate();
  }

  function openAttendanceRule(rule: AttendanceRule) {
    setAttendanceEditor({
      open: true,
      rule,
      values: {
        name: rule.name,
        timezone1_start: rule.timezone1_start.slice(0, 5),
        timezone1_end: rule.timezone1_end.slice(0, 5),
        timezone2_start: rule.timezone2_start.slice(0, 5),
        timezone2_end: rule.timezone2_end.slice(0, 5),
      },
    });
  }

  function setAttendanceRuleValue(
    field: keyof typeof attendanceEditor.values,
    value: string,
  ) {
    setAttendanceEditor((current) => ({
      ...current,
      values: { ...current.values, [field]: value },
    }));
  }

  useEffect(() => {
    setHolidayDraftDates(
      (attendanceHolidays ?? [])
        .filter((item) => item.is_holiday)
        .map((item) => stringToDate(item.holiday_date)),
    );
  }, [attendanceHolidays]);

  function syncHolidaySelection(nextDates: Date[]) {
    setHolidayDraftDates(nextDates);
    const currentHolidayDates = new Set(
      (attendanceHolidays ?? [])
        .filter((item) => item.is_holiday)
        .map((item) => item.holiday_date),
    );
    const nextHolidayDates = new Set(nextDates.map(dateToString));
    for (const holidayDate of nextHolidayDates) {
      if (!currentHolidayDates.has(holidayDate)) {
        saveAttendanceHoliday.mutate({
          holiday_date: holidayDate,
          is_holiday: true,
          name: "Tanggal merah",
        });
      }
    }
    for (const holidayDate of currentHolidayDates) {
      if (!nextHolidayDates.has(holidayDate)) {
        const item = attendanceHolidays?.find(
          (holiday) =>
            holiday.holiday_date === holidayDate && holiday.is_holiday,
        );
        if (item) deleteAttendanceHoliday.mutate(item.id);
      }
    }
  }

  const selectedHolidayDates = (attendanceHolidays ?? [])
    .filter((item) => item.is_holiday)
    .map((item) => stringToDate(item.holiday_date));

  return (
    <>
      <PageHeader title="Settings" eyebrow="Configurable calculation rules" />
      {isDevelopmentEnvironment ? (
        <LayerCard className="flex items-center justify-between gap-4 border-kumo-danger p-4">
          <div>
            <Text as="h2" variant="heading3">
              Testing Tools
            </Text>
            <Text variant="secondary" size="sm">
              Refresh database menghapus semua data app, lalu membuat ulang
              admin dan default rules.
            </Text>
            {refreshMessage ? (
              <Text variant="error" size="sm">
                {refreshMessage}
              </Text>
            ) : null}
          </div>
          <Button
            variant="secondary-destructive"
            icon={<RefreshCcw size={18} />}
            loading={refreshDatabase.isPending}
            onClick={confirmRefresh}
          >
            Refresh Database
          </Button>
        </LayerCard>
      ) : null}
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">
          Payroll Rules
        </Text>
        <DataTable
          rows={payrollRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            {
              key: "default",
              header: "Default",
              render: (row) => (
                <Badge variant={row.is_default ? "success" : "secondary"}>
                  {row.is_default ? "yes" : "no"}
                </Badge>
              ),
            },
            {
              key: "bpjs",
              header: "BPJS",
              align: "right",
              render: (row) => `${(row.bpjs_jht_rate * 100).toFixed(1)}%`,
            },
            {
              key: "overtime",
              header: "Lembur / menit",
              align: "right",
              render: (row) => row.overtime_rate_per_minute,
            },
            {
              key: "pph",
              header: "PPh 21",
              align: "right",
              render: (row) => `${(row.pph21_rate * 100).toFixed(1)}%`,
            },
          ]}
        />
      </LayerCard>
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">
          Attendance Rules
        </Text>
        <DataTable
          rows={attendanceRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            {
              key: "default",
              header: "Default",
              render: (row) => (
                <Badge variant={row.is_default ? "success" : "secondary"}>
                  {row.is_default ? "yes" : "no"}
                </Badge>
              ),
            },
            {
              key: "tz1",
              header: "Timezone I",
              render: (row) =>
                `${row.timezone1_start.slice(0, 5)} - ${row.timezone1_end.slice(0, 5)}`,
            },
            {
              key: "tz2",
              header: "Timezone II",
              render: (row) =>
                `${row.timezone2_start.slice(0, 5)} - ${row.timezone2_end.slice(0, 5)}`,
            },
            {
              key: "actions",
              header: "",
              align: "right",
              sticky: "right",
              render: (row) => (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pencil size={16} />}
                  onClick={() => openAttendanceRule(row)}
                >
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </LayerCard>
      <LayerCard className="flex flex-col gap-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Text as="h2" variant="heading3">
              Kalender Libur Absensi
            </Text>
            <Text variant="secondary" size="sm">
              Tanggal merah per bulan untuk import absensi dan form manual.
            </Text>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input
              type="month"
              value={holidayPeriod}
              onChange={(event) => setHolidayPeriod(event.target.value)}
              className="w-[160px]"
            />
            <MultiDatePickerPopover
              value={holidayDraftDates}
              onChange={syncHolidaySelection}
              triggerLabel={`Pilih tanggal (${selectedHolidayDates.length})`}
              defaultMonth={holidayBounds.monthDate}
              isDateDisabled={(date) => dateToString(date).slice(0, 7) !== holidayPeriod}
            />
            <Badge variant="secondary">
              {selectedHolidayDates.length} tanggal
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <DataTable
            rows={attendanceHolidays ?? []}
            columns={[
              {
                key: "date",
                header: "Tanggal",
                render: (row) => row.holiday_date,
              },
              {
                key: "type",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.is_holiday ? "error" : "success"}>
                    {row.is_holiday ? "Libur" : "Hari biasa"}
                  </Badge>
                ),
              },
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
                      saveAttendanceHoliday.mutate({
                        holiday_date: row.holiday_date,
                        is_holiday: row.is_holiday,
                        name: nextName,
                      });
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
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<CalendarDays size={16} />}
                      loading={saveAttendanceHoliday.isPending}
                      onClick={() =>
                        saveAttendanceHoliday.mutate({
                          holiday_date: row.holiday_date,
                          is_holiday: !row.is_holiday,
                          name: row.is_holiday
                            ? "Jadwal masuk"
                            : "Tanggal merah",
                        })
                      }
                    >
                      {row.is_holiday ? "Jadikan biasa" : "Jadikan libur"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary-destructive"
                      shape="square"
                      aria-label="Hapus override libur"
                      loading={deleteAttendanceHoliday.isPending}
                      onClick={() => deleteAttendanceHoliday.mutate(row.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </LayerCard>
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">
          Doctor Fee Rules
        </Text>
        <DataTable
          rows={doctorRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            {
              key: "default",
              header: "Default",
              render: (row) => (
                <Badge variant={row.is_default ? "success" : "secondary"}>
                  {row.is_default ? "yes" : "no"}
                </Badge>
              ),
            },
            {
              key: "normal",
              header: "Normal",
              align: "right",
              render: (row) => `${(row.normal_fee_rate * 100).toFixed(0)}%`,
            },
            {
              key: "ortho",
              header: "Ortho",
              align: "right",
              render: (row) => `${(row.ortho_fee_rate * 100).toFixed(0)}%`,
            },
            {
              key: "tax",
              header: "Pajak",
              align: "right",
              render: (row) => `${(row.tax_rate * 100).toFixed(1)}%`,
            },
          ]}
        />
      </LayerCard>

      <Dialog.Root
        open={attendanceEditor.open}
        onOpenChange={(open) =>
          setAttendanceEditor((current) => ({ ...current, open }))
        }
      >
        <Dialog size="lg" className="p-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveAttendanceRule.mutate();
            }}
          >
            <div className="border-b border-kumo-hairline px-6 py-4">
              <Dialog.Title className="text-lg font-bold">
                Edit Attendance Rule
              </Dialog.Title>
              <Dialog.Description>
                Atur jam default untuk kalkulasi terlambat, pulang awal, absen,
                dan lembur.
              </Dialog.Description>
            </div>
            <div className="grid gap-3 px-6 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Nama Rule">
                  <Input
                    value={attendanceEditor.values.name}
                    onChange={(event) =>
                      setAttendanceRuleValue("name", event.target.value)
                    }
                  />
                </Field>
              </div>
              <Field label="Timezone I Mulai">
                <Input
                  type="time"
                  value={attendanceEditor.values.timezone1_start}
                  onChange={(event) =>
                    setAttendanceRuleValue(
                      "timezone1_start",
                      event.target.value,
                    )
                  }
                />
              </Field>
              <Field label="Timezone I Selesai">
                <Input
                  type="time"
                  value={attendanceEditor.values.timezone1_end}
                  onChange={(event) =>
                    setAttendanceRuleValue("timezone1_end", event.target.value)
                  }
                />
              </Field>
              <Field label="Timezone II Mulai">
                <Input
                  type="time"
                  value={attendanceEditor.values.timezone2_start}
                  onChange={(event) =>
                    setAttendanceRuleValue(
                      "timezone2_start",
                      event.target.value,
                    )
                  }
                />
              </Field>
              <Field label="Timezone II Selesai">
                <Input
                  type="time"
                  value={attendanceEditor.values.timezone2_end}
                  onChange={(event) =>
                    setAttendanceRuleValue("timezone2_end", event.target.value)
                  }
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
              <Dialog.Close
                render={(props) => (
                  <Button {...props} variant="secondary" type="button">
                    Batal
                  </Button>
                )}
              />
              <Button
                variant="primary"
                type="submit"
                loading={saveAttendanceRule.isPending}
              >
                Simpan
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
