import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import {
  Chart,
  ChartPalette,
  type KumoChartOption,
} from "@cloudflare/kumo/components/chart";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Field } from "@cloudflare/kumo/components/field";
import { Grid } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Text } from "@cloudflare/kumo/components/text";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  AlertTriangle,
  Calculator,
  Eye,
  FileSpreadsheet,
  FileText,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ConfirmActionDialog } from "../components/ConfirmActionDialog";
import { DataTable } from "../components/DataTable";
import { api, downloadFile, rupiah } from "../lib/api";
import { moneyNumber, numberField, wholeNumber } from "../lib/number-fields";

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type PeriodStatus = "empty" | "not_calculated" | "draft" | "locked";

type PayrollSummary = {
  id: number | null;
  employee_id: number;
  employee_name: string;
  position: string | null;
  join_date: string | null;
  base_salary: number;
  working_days: number;
  auto_double_shift_count: number;
  auto_sunday_count: number;
  double_shift_count_override: number | null;
  sunday_count_override: number | null;
  double_shift_count: number;
  sunday_count: number;
  izin_count: number;
  sakit_count: number;
  cuti_count: number;
  alpha_count: number;
  double_shift_fee: number;
  sunday_fee: number;
  overtime_minutes: number;
  overtime_rate_per_minute: number;
  overtime_total: number;
  bonus: number;
  position_allowance: number;
  gross_salary: number;
  bpjs_deduction: number;
  other_deduction: number;
  pph21: number;
  total_deduction: number;
  net_salary: number;
  payment_method: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  needs_review: boolean;
  status: string;
};

type PayrollOverview = {
  period: string;
  status: PeriodStatus;
  employee_count: number;
  attendance_count: number;
  attendance_review_count: number;
  payroll_review_count: number;
  overtime_record_count: number;
  total_base_salary: number;
  total_gross_salary: number;
  total_overtime_minutes: number;
  total_overtime: number;
  total_deduction: number;
  total_net_salary: number;
  summaries: PayrollSummary[];
};

type OvertimeRecord = {
  id: number;
  employee_id: number | null;
  employee_name_snapshot: string;
  work_date: string;
  timezone1_in: string | null;
  timezone1_out: string | null;
  timezone2_in: string | null;
  timezone2_out: string | null;
  is_holiday: boolean;
  is_sunday: boolean;
  is_double_shift: boolean;
  overtime_minutes: number;
  status_note: string | null;
};

type AdjustmentValues = {
  double_shift_count: string;
  overtime_minutes: string;
  sunday_count: string;
  bonus: string;
  position_allowance: string;
  other_deduction: string;
  izin_count: string;
  sakit_count: string;
  cuti_count: string;
  alpha_count: string;
  payment_method: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  needs_review: boolean;
};

const statusLabel: Record<PeriodStatus, string> = {
  empty: "Belum ada absensi",
  not_calculated: "Belum dihitung",
  draft: "Draft sudah dihitung",
  locked: "Locked / final",
};

function includesText(value: unknown, query: string) {
  return String(value ?? "")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function previousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function deltaPercent(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function timeRange(start?: string | null, end?: string | null) {
  return `${start?.slice(0, 5) || "-"} / ${end?.slice(0, 5) || "-"}`;
}

function statusBadge(status: PeriodStatus | string) {
  if (status === "locked") return <Badge variant="success">locked</Badge>;
  if (status === "draft") return <Badge variant="info">draft</Badge>;
  if (status === "not_calculated")
    return <Badge variant="secondary">belum dihitung</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function attendanceType(row: OvertimeRecord) {
  if (row.is_holiday) return "Libur";
  if (row.is_sunday) return "Minggu";
  if (row.is_double_shift) return "Double shift";
  return "Hari biasa";
}

function valuesFromSummary(row: PayrollSummary): AdjustmentValues {
  return {
    double_shift_count: String(row.double_shift_count ?? 0),
    overtime_minutes: String(row.overtime_minutes ?? 0),
    sunday_count: String(row.sunday_count ?? 0),
    bonus: String(row.bonus ?? 0),
    position_allowance: String(row.position_allowance ?? 0),
    other_deduction: String(row.other_deduction ?? 0),
    izin_count: String(row.izin_count ?? 0),
    sakit_count: String(row.sakit_count ?? 0),
    cuti_count: String(row.cuti_count ?? 0),
    alpha_count: String(row.alpha_count ?? 0),
    payment_method: row.payment_method ?? "Transfer",
    bank_name: row.bank_name ?? "",
    account_name: row.account_name ?? row.employee_name,
    account_number: row.account_number ?? "",
    needs_review: row.needs_review,
  };
}

function adjustmentPayload(values: AdjustmentValues) {
  return {
    double_shift_count_override: wholeNumber(values.double_shift_count),
    overtime_minutes_override: wholeNumber(values.overtime_minutes),
    sunday_count_override: wholeNumber(values.sunday_count),
    bonus: moneyNumber(values.bonus),
    position_allowance: moneyNumber(values.position_allowance),
    other_deduction: moneyNumber(values.other_deduction),
    izin_count: wholeNumber(values.izin_count),
    sakit_count: wholeNumber(values.sakit_count),
    cuti_count: wholeNumber(values.cuti_count),
    alpha_count: wholeNumber(values.alpha_count),
    payment_method: values.payment_method || "Transfer",
    bank_name: values.bank_name || null,
    account_name: values.account_name || null,
    account_number: values.account_number || null,
    needs_review: values.needs_review,
  };
}

export function PayrollPage() {
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    null,
  );
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [editor, setEditor] = useState<{
    open: boolean;
    row?: PayrollSummary;
    values: AdjustmentValues;
  }>({
    open: false,
    values: valuesFromSummary({
      id: 0,
      employee_id: 0,
      employee_name: "",
      position: null,
      join_date: null,
      base_salary: 0,
      working_days: 25,
      auto_double_shift_count: 0,
      auto_sunday_count: 0,
      double_shift_count_override: null,
      sunday_count_override: null,
      double_shift_count: 0,
      sunday_count: 0,
      izin_count: 0,
      sakit_count: 0,
      cuti_count: 0,
      alpha_count: 0,
      double_shift_fee: 0,
      sunday_fee: 0,
      overtime_minutes: 0,
      overtime_rate_per_minute: 0,
      overtime_total: 0,
      bonus: 0,
      position_allowance: 0,
      gross_salary: 0,
      bpjs_deduction: 0,
      other_deduction: 0,
      pph21: 0,
      total_deduction: 0,
      net_salary: 0,
      payment_method: "Transfer",
      bank_name: null,
      account_name: null,
      account_number: null,
      needs_review: false,
      status: "draft",
    }),
  });

  const { data: overview } = useQuery({
    queryKey: ["payroll-overview", period],
    queryFn: () => api<PayrollOverview>(`/payroll-periods/${period}/overview`),
  });
  const previous = previousPeriod(period);
  const { data: previousOverview } = useQuery({
    queryKey: ["payroll-overview", previous],
    queryFn: () =>
      api<PayrollOverview>(`/payroll-periods/${previous}/overview`),
  });
  const selectedQuery = selectedEmployeeId
    ? `?employee_id=${selectedEmployeeId}`
    : "";
  const { data: overtimeRows } = useQuery({
    queryKey: ["payroll-overtime", period, selectedEmployeeId],
    queryFn: () =>
      api<OvertimeRecord[]>(
        `/payroll-periods/${period}/overtime${selectedQuery}`,
      ),
  });

  const calculate = useMutation({
    mutationFn: () =>
      api(`/payroll-periods/${period}/calculate`, { method: "POST" }),
    onSuccess: async () => {
      toasts.add({ title: "Payroll selesai dihitung", variant: "success" });
      await queryClient.invalidateQueries({
        queryKey: ["payroll-overview", period],
      });
      await queryClient.invalidateQueries({
        queryKey: ["payroll-overtime", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Payroll gagal dihitung",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const lock = useMutation({
    mutationFn: () =>
      api(`/payroll-periods/${period}/lock`, { method: "POST" }),
    onSuccess: async () => {
      setLockConfirmOpen(false);
      toasts.add({ title: "Periode payroll dikunci", variant: "success" });
      await queryClient.invalidateQueries({
        queryKey: ["payroll-overview", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Periode gagal dikunci",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const unlock = useMutation({
    mutationFn: () =>
      api(`/payroll-periods/${period}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password: unlockPassword }),
      }),
    onSuccess: async () => {
      setUnlockConfirmOpen(false);
      setUnlockPassword("");
      toasts.add({
        title: "Periode payroll dibuka kuncinya",
        variant: "success",
      });
      await queryClient.invalidateQueries({
        queryKey: ["payroll-overview", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Gagal membuka kunci periode",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const saveAdjustment = useMutation({
    mutationFn: () => {
      if (!editor.row?.id) {
        throw new Error(
          "Payroll karyawan ini belum dihitung. Jalankan Hitung Ulang dulu sebelum edit adjustment.",
        );
      }
      return api<PayrollSummary>(`/payroll-records/${editor.row.id}`, {
        method: "PATCH",
        body: JSON.stringify(adjustmentPayload(editor.values)),
      });
    },
    onSuccess: async () => {
      toasts.add({ title: "Adjustment payroll disimpan", variant: "success" });
      setEditor((current) => ({ ...current, open: false }));
      await queryClient.invalidateQueries({
        queryKey: ["payroll-overview", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Adjustment gagal disimpan",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const filteredSummaries = useMemo(() => {
    return (overview?.summaries ?? [])
      .filter((row) => {
        const matchesSearch =
          !search ||
          [
            row.employee_name,
            row.position,
            row.bank_name,
            row.account_name,
            row.account_number,
          ].some((value) => includesText(value, search));
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "review"
            ? row.needs_review
            : row.status === statusFilter);
        return matchesSearch && matchesStatus;
      })
      .sort((left, right) => left.employee_id - right.employee_id);
  }, [overview?.summaries, search, statusFilter]);

  const selectedSummary = useMemo(
    () =>
      filteredSummaries.find((row) => row.employee_id === selectedEmployeeId) ??
      filteredSummaries[0],
    [filteredSummaries, selectedEmployeeId],
  );

  useEffect(() => {
    if (!filteredSummaries.length) {
      setSelectedEmployeeId(null);
      return;
    }
    if (
      !selectedEmployeeId ||
      !filteredSummaries.some((row) => row.employee_id === selectedEmployeeId)
    ) {
      setSelectedEmployeeId(filteredSummaries[0].employee_id);
    }
  }, [filteredSummaries, selectedEmployeeId]);

  const hasPayrollRows = useMemo(
    () => (overview?.summaries ?? []).some((row) => row.id),
    [overview?.summaries],
  );

  const banner = useMemo(() => {
    if (!overview || overview.status === "empty")
      return {
        variant: "secondary" as const,
        description: "Belum ada data absensi untuk periode ini.",
      };
    if (overview.attendance_count === 0)
      return {
        variant: "alert" as const,
        description:
          "Belum ada data absensi untuk periode ini. Rekap karyawan tetap ditampilkan, tetapi lembur dan potongan absensi akan 0 sampai absensi diimport.",
      };
    if (
      overview.attendance_review_count > 0 ||
      overview.payroll_review_count > 0
    ) {
      return {
        variant: "alert" as const,
        description: `${overview.attendance_review_count + overview.payroll_review_count} data masih perlu review sebelum periode bisa dikunci.`,
      };
    }
    if (overview.status === "locked")
      return {
        variant: "default" as const,
        description: "Periode payroll ini sudah locked/final.",
      };
    if (overview.status === "draft")
      return {
        variant: "secondary" as const,
        description:
          "Draft payroll sudah dihitung. Cek adjustment, lembur, lalu lock jika sudah final.",
      };
    return {
      variant: "secondary" as const,
      description:
        "Absensi sudah tersedia. Jalankan Hitung Ulang untuk membuat payroll.",
    };
  }, [overview]);

  const comparisonItems = useMemo(
    () => [
      {
        label: "Gross",
        current: overview?.total_gross_salary ?? 0,
        previous: previousOverview?.total_gross_salary ?? 0,
      },
      {
        label: "Potongan",
        current: overview?.total_deduction ?? 0,
        previous: previousOverview?.total_deduction ?? 0,
      },
      {
        label: "Lembur",
        current: overview?.total_overtime ?? 0,
        previous: previousOverview?.total_overtime ?? 0,
      },
      {
        label: "Transfer",
        current: overview?.total_net_salary ?? 0,
        previous: previousOverview?.total_net_salary ?? 0,
      },
    ],
    [overview, previousOverview],
  );

  const chartOptions = useMemo<KumoChartOption>(
    () => ({
      color: [ChartPalette.categorical(0), ChartPalette.semantic("Success")],
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: ChartPalette.text("secondary"), fontSize: 11 },
      },
      grid: { left: 86, right: 24, top: 34, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        dangerousHtmlFormatter: (params) => {
          const rows = (Array.isArray(params) ? params : [params])
            .map(
              (item) =>
                `${item.marker ?? ""} ${item.seriesName}: <strong>${rupiah.format(Number(item.value ?? 0))}</strong>`,
            )
            .join("<br/>");
          return `${(Array.isArray(params) ? params[0] : params).name}<br/>${rows}`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: comparisonItems.map((item) => item.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: ChartPalette.text("primary"), fontSize: 12 },
      },
      series: [
        {
          name: `Bulan lalu (${previous})`,
          type: "bar",
          barWidth: 10,
          data: comparisonItems.map((item) => item.previous),
          itemStyle: { borderRadius: [0, 4, 4, 0] },
        },
        {
          name: `Bulan ini (${period})`,
          type: "bar",
          barWidth: 10,
          data: comparisonItems.map((item) => item.current),
          itemStyle: { borderRadius: [0, 4, 4, 0] },
        },
      ],
    }),
    [comparisonItems, period, previous],
  );

  function openAdjustment(row: PayrollSummary) {
    if (!row.id) {
      toasts.add({
        title: "Payroll belum dihitung",
        description: "Jalankan Hitung Ulang dulu sebelum edit adjustment.",
        variant: "error",
      });
      return;
    }
    setEditor({ open: true, row, values: valuesFromSummary(row) });
  }

  async function exportWorkbook() {
    if (!hasPayrollRows) return;
    await downloadFile(
      `/reports/payroll?period=${period}&format=xlsx`,
      `payroll-${period}.xlsx`,
    );
  }

  async function exportPdf() {
    if (!hasPayrollRows) return;
    await downloadFile(
      `/reports/payroll?period=${period}&format=pdf`,
      `payroll-${period}.pdf`,
    );
  }

  async function exportPdfZip() {
    if (!hasPayrollRows) return;
    await downloadFile(
      `/reports/payroll?period=${period}&format=zip`,
      `payroll-${period}-per-karyawan.zip`,
    );
  }

  async function exportSlip(row: PayrollSummary) {
    if (!row.id) return;
    await downloadFile(
      `/reports/payroll/${period}/slips/${row.employee_id}.pdf`,
      `slip-gaji-${period}-${row.employee_name}.pdf`,
    );
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review gaji, lembur, adjustment, lock periode, dan export slip.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input
            className="w-40"
            aria-label="Periode payroll"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
          <Button
            variant="secondary"
            icon={<Calculator size={18} />}
            loading={calculate.isPending}
            disabled={overview?.status === "locked"}
            onClick={() => calculate.mutate()}
          >
            Hitung Ulang
          </Button>
          {overview?.status === "locked" ? (
            <Button
              variant="secondary"
              icon={<LockOpen size={18} />}
              loading={unlock.isPending}
              onClick={() => {
                setUnlockPassword("");
                setUnlockConfirmOpen(true);
              }}
            >
              Unlock Periode
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<Lock size={18} />}
              loading={lock.isPending}
              disabled={
                overview?.status === "not_calculated" ||
                overview?.status === "empty" ||
                overview?.attendance_review_count !== 0 ||
                overview?.payroll_review_count !== 0 ||
                !hasPayrollRows
              }
              onClick={() => setLockConfirmOpen(true)}
            >
              Lock Periode
            </Button>
          )}
          <Button
            variant="primary"
            icon={<FileSpreadsheet size={18} />}
            style={{
              background: "#059669",
              color: "#ffffff",
              borderColor: "#047857",
            }}
            disabled={!hasPayrollRows}
            onClick={exportWorkbook}
          >
            Export XLSX
          </Button>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={
                <Button
                  variant="destructive"
                  icon={<FileText size={18} />}
                  style={{
                    background: "#dc2626",
                    color: "#ffffff",
                    borderColor: "#b91c1c",
                  }}
                  disabled={!hasPayrollRows}
                >
                  Export PDF
                </Button>
              }
            />
            <DropdownMenu.Content>
              <DropdownMenu.Item
                icon={<FileText className="mr-2" size={16} />}
                onClick={exportPdf}
              >
                PDF gabungan
              </DropdownMenu.Item>
              <DropdownMenu.Item
                icon={<FileText className="mr-2" size={16} />}
                onClick={exportPdfZip}
              >
                ZIP PDF per karyawan
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>
      </div>

      <Banner variant={banner.variant} description={banner.description} />

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text as="h2" variant="heading3">
              Rekap Payroll Karyawan
            </Text>
            <p className="mt-1 text-sm text-kumo-subtle">
              {statusLabel[overview?.status ?? "empty"]} untuk periode {period}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Total absensi atau payroll yang masih perlu dicek sebelum lock.">
              <Badge
                variant={
                  (overview?.attendance_review_count ?? 0) +
                  (overview?.payroll_review_count ?? 0)
                    ? "error"
                    : "success"
                }
              >
                {(overview?.attendance_review_count ?? 0) +
                  (overview?.payroll_review_count ?? 0)}{" "}
                review
              </Badge>
            </Tooltip>
            {statusBadge(overview?.status ?? "empty")}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-md border border-kumo-hairline bg-kumo-base p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <Text as="strong" variant="body" bold>
                  Perbandingan Bulanan
                </Text>
                <p className="mt-0.5 text-xs text-kumo-subtle">
                  Membandingkan {period} dengan {previous} untuk metrik payroll
                  utama.
                </p>
              </div>
              {previousOverview?.status
                ? statusBadge(previousOverview.status)
                : null}
            </div>
            <Chart
              echarts={echarts}
              options={chartOptions}
              height={188}
              aria-label="Grafik perbandingan payroll bulanan"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {comparisonItems.map((item) => {
              const delta = deltaPercent(item.current, item.previous);
              const variant =
                delta > 0 ? "success" : delta < 0 ? "error" : "secondary";
              return (
                <div
                  key={item.label}
                  className="rounded-md border border-kumo-hairline bg-kumo-base px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium uppercase text-kumo-subtle">
                      {item.label}
                    </div>
                    <Badge variant={variant}>
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-kumo-default">
                    {rupiah.format(item.current)}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-kumo-subtle">
                    Bulan lalu {rupiah.format(item.previous)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-72 flex-1 items-center gap-2">
            <Search size={16} className="text-kumo-subtle" />
            <Input
              aria-label="Cari payroll karyawan"
              className="flex-1"
              placeholder="Cari karyawan, jabatan, bank, rekening..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            className="w-44"
            aria-label="Filter status payroll"
            value={statusFilter}
            renderValue={(value) =>
              value === "review"
                ? "Perlu review"
                : value === "locked"
                  ? "Locked"
                  : value === "draft"
                    ? "Draft"
                    : "Semua status"
            }
            onValueChange={(value) => setStatusFilter(String(value))}
          >
            <Select.Option value="all">Semua status</Select.Option>
            <Select.Option value="draft">Draft</Select.Option>
            <Select.Option value="locked">Locked</Select.Option>
            <Select.Option value="review">Perlu review</Select.Option>
          </Select>
        </div>

        <DataTable
          rows={filteredSummaries}
          pagination
          pageSize={25}
          minTableWidth={1900}
          rowKey={(row) => row.employee_id}
          selectable
          selectedKeys={new Set(selectedEmployeeId ? [selectedEmployeeId] : [])}
          onToggleRow={(row) => setSelectedEmployeeId(row.employee_id)}
          onTogglePage={(rows) =>
            rows[0] && setSelectedEmployeeId(rows[0].employee_id)
          }
          columns={[
            {
              key: "name",
              header: "Karyawan",
              sticky: "left",
              width: 220,
              render: (row) => row.employee_name,
            },
            {
              key: "position",
              header: "Jabatan",
              render: (row) => row.position ?? "-",
            },
            {
              key: "base",
              header: "Gaji Pokok",
              align: "right",
              render: (row) => rupiah.format(row.base_salary),
            },
            {
              key: "double",
              header: "Double Shift",
              align: "right",
              render: (row) => (
                <div className="text-right">
                  <div>{`${row.double_shift_count} / ${rupiah.format(row.double_shift_fee)}`}</div>
                  {row.double_shift_count_override !== null ? (
                    <div className="text-[11px] text-kumo-subtle">
                      Auto {row.auto_double_shift_count}
                    </div>
                  ) : null}
                </div>
              ),
            },
            {
              key: "sunday",
              header: "Hari Libur",
              align: "right",
              render: (row) => (
                <div className="text-right">
                  <div>{`${row.sunday_count} / ${rupiah.format(row.sunday_fee)}`}</div>
                  {row.sunday_count_override !== null ? (
                    <div className="text-[11px] text-kumo-subtle">
                      Auto {row.auto_sunday_count}
                    </div>
                  ) : null}
                </div>
              ),
            },
            {
              key: "otm",
              header: "Lembur Menit",
              align: "right",
              render: (row) => `${row.overtime_minutes} min`,
            },
            {
              key: "ot",
              header: "Total Lembur",
              align: "right",
              render: (row) => rupiah.format(row.overtime_total),
            },
            {
              key: "bonus",
              header: "Bonus",
              align: "right",
              render: (row) => rupiah.format(row.bonus),
            },
            {
              key: "allowance",
              header: "Tunjangan",
              align: "right",
              render: (row) => rupiah.format(row.position_allowance),
            },
            {
              key: "bpjs",
              header: "BPJS",
              align: "right",
              render: (row) => rupiah.format(row.bpjs_deduction),
            },
            {
              key: "deduction",
              header: "Potongan Lain",
              align: "right",
              render: (row) => rupiah.format(row.other_deduction),
            },
            {
              key: "pph",
              header: "PPh21",
              align: "right",
              render: (row) => rupiah.format(row.pph21),
            },
            {
              key: "net",
              header: "Total Transfer",
              align: "right",
              sticky: "right",
              width: 170,
              render: (row) => <strong>{rupiah.format(row.net_salary)}</strong>,
            },
            {
              key: "bank",
              header: "Bank",
              render: (row) => row.bank_name ?? "-",
            },
            {
              key: "account",
              header: "No Rekening",
              render: (row) => row.account_number ?? "-",
            },
            {
              key: "status",
              header: "Status",
              render: (row) =>
                row.needs_review ? (
                  <Badge variant="error">review</Badge>
                ) : (
                  statusBadge(row.status)
                ),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              sticky: "right",
              width: 56,
              render: (row) => (
                <div
                  className="flex justify-end"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenu.Trigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          shape="square"
                          aria-label={`Aksi ${row.employee_name}`}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      }
                    />
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        icon={<Eye className="mr-2" size={16} />}
                        onClick={() => setSelectedEmployeeId(row.employee_id)}
                      >
                        Lihat lembur
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        icon={<Pencil className="mr-2" size={16} />}
                        disabled={overview?.status === "locked" || !row.id}
                        onClick={() => openAdjustment(row)}
                      >
                        Edit adjustment
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        icon={<FileText className="mr-2" size={16} />}
                        disabled={!row.id}
                        onClick={() => exportSlip(row)}
                      >
                        Export slip PDF
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </div>
              ),
            },
          ]}
        />
      </LayerCard>

      <LayerCard className="mb-6 flex flex-col gap-4 p-4">
        <div>
          <Text as="h2" variant="heading3">
            Detail Lembur Karyawan
          </Text>
          <p className="mt-1 text-sm text-kumo-subtle">
            {selectedSummary
              ? selectedSummary.employee_name
              : "Pilih karyawan dari tabel rekap."}
          </p>
        </div>
        <DataTable
          rows={overtimeRows ?? []}
          pagination
          pageSize={25}
          minTableWidth={1100}
          rowKey={(row) => row.id}
          columns={[
            { key: "date", header: "Tanggal", render: (row) => row.work_date },
            {
              key: "name",
              header: "Nama",
              render: (row) => row.employee_name_snapshot,
            },
            {
              key: "tz1",
              header: "Timezone I",
              render: (row) => timeRange(row.timezone1_in, row.timezone1_out),
            },
            {
              key: "tz2",
              header: "Timezone II",
              render: (row) => timeRange(row.timezone2_in, row.timezone2_out),
            },
            {
              key: "type",
              header: "Status Hari",
              render: (row) => attendanceType(row),
            },
            {
              key: "minutes",
              header: "Menit Lembur",
              align: "right",
              render: (row) => (
                <span className="font-semibold text-kumo-success">
                  {row.overtime_minutes} min
                </span>
              ),
            },
            {
              key: "note",
              header: "Catatan",
              render: (row) => row.status_note ?? "-",
            },
          ]}
        />
      </LayerCard>

      <Dialog.Root
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
      >
        <Dialog size="lg" className="p-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveAdjustment.mutate();
            }}
          >
            <div className="border-b border-kumo-hairline px-6 py-4">
              <Dialog.Title className="text-lg font-bold">
                Edit Adjustment Payroll
              </Dialog.Title>
              <Dialog.Description>
                {editor.row?.employee_name ?? "Karyawan"}
              </Dialog.Description>
            </div>
            <div className="px-6 py-4">
              <Grid variant="2up" gap="sm">
                <Field
                  label="Double Shift"
                  labelTooltip={`Auto dari absensi: ${editor.row?.auto_double_shift_count ?? 0}. Nilai final dikalikan Rp90.000.`}
                >
                  <Input
                    type="number"
                    {...numberField.count}
                    value={editor.values.double_shift_count}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          double_shift_count: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Overtime (menit)"
                  labelTooltip={`Auto dari absensi: ${editor.row?.overtime_minutes ?? 0}. Override manual nilai lembur.`}
                >
                  <Input
                    type="number"
                    {...numberField.minutes}
                    value={editor.values.overtime_minutes}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          overtime_minutes: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Masuk Hari Libur"
                  labelTooltip={`Auto dari absensi: ${editor.row?.auto_sunday_count ?? 0}. Nilai final dikalikan Rp90.000.`}
                >
                  <Input
                    type="number"
                    {...numberField.count}
                    value={editor.values.sunday_count}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          sunday_count: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Bonus">
                  <Input
                    type="number"
                    {...numberField.money}
                    value={editor.values.bonus}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          bonus: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Tunjangan Jabatan">
                  <Input
                    type="number"
                    {...numberField.money}
                    value={editor.values.position_allowance}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          position_allowance: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Potongan Lain">
                  <Input
                    type="number"
                    {...numberField.money}
                    value={editor.values.other_deduction}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          other_deduction: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Metode Pembayaran">
                  <Input
                    value={editor.values.payment_method}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          payment_method: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Izin">
                  <Input
                    type="number"
                    {...numberField.count}
                    value={editor.values.izin_count}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          izin_count: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Sakit">
                  <Input
                    type="number"
                    {...numberField.count}
                    value={editor.values.sakit_count}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          sakit_count: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Cuti">
                  <Input
                    type="number"
                    {...numberField.count}
                    value={editor.values.cuti_count}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          cuti_count: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Alpha">
                  <Input
                    type="number"
                    {...numberField.count}
                    value={editor.values.alpha_count}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          alpha_count: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Bank">
                  <Input
                    value={editor.values.bank_name}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          bank_name: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Nama Penerima">
                  <Input
                    value={editor.values.account_name}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          account_name: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="No Rekening">
                  <Input
                    value={editor.values.account_number}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          account_number: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Switch
                  size="sm"
                  variant="neutral"
                  label="Perlu review"
                  checked={editor.values.needs_review}
                  onCheckedChange={(checked) =>
                    setEditor((current) => ({
                      ...current,
                      values: { ...current.values, needs_review: checked },
                    }))
                  }
                />
              </Grid>
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
                loading={saveAdjustment.isPending}
              >
                Simpan
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
      <ConfirmActionDialog
        open={lockConfirmOpen}
        title="Kunci Periode Payroll?"
        description={`Periode ${period} akan dikunci. Setelah dikunci, data gaji, absensi, dan adjustment pada periode ini tidak bisa diubah. Pastikan semua data sudah benar sebelum mengunci.`}
        confirmLabel="Kunci Periode"
        icon={AlertTriangle}
        isPending={lock.isPending}
        onOpenChange={setLockConfirmOpen}
        onConfirm={() => lock.mutate()}
      />

      <ConfirmActionDialog
        open={unlockConfirmOpen}
        title="Buka Kunci Periode Payroll?"
        description="Membuka kunci periode memungkinkan perubahan data kembali. Masukkan password admin Anda untuk konfirmasi."
        confirmLabel="Buka Kunci"
        icon={AlertTriangle}
        isPending={unlock.isPending}
        onOpenChange={(open) => {
          setUnlockConfirmOpen(open);
          if (!open) setUnlockPassword("");
        }}
        onConfirm={() => unlock.mutate()}
      >
        <input
          type="password"
          className="w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm outline-none focus:border-kumo-focus focus:ring-1 focus:ring-kumo-focus"
          placeholder="Masukkan password admin"
          value={unlockPassword}
          onChange={(event) => setUnlockPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && unlockPassword) unlock.mutate();
          }}
          autoFocus
        />
      </ConfirmActionDialog>
    </>
  );
}
