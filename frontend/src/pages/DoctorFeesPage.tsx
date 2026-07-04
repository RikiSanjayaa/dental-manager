import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import {
  Chart,
  ChartPalette,
  type KumoChartOption,
} from "@cloudflare/kumo/components/chart";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
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
  Database,
  ExternalLink,
  Eye,
  FileText,
  FileSpreadsheet,
  Lock,
  LockOpen,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ConfirmActionDialog } from "../components/ConfirmActionDialog";
import { DataTable } from "../components/DataTable";
import { api, downloadFile, rupiah } from "../lib/api";
import { isDevelopmentEnvironment } from "../lib/environment";

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type PeriodStatus = "empty" | "not_calculated" | "draft" | "locked";

type DoctorSummary = {
  id: number;
  doctor_id: number;
  doctor_name: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  transaction_count: number;
  treatment_fee_total: number;
  ortho_fee_total: number;
  total_fee: number;
  total_bill: number;
  deduction: number;
  tax: number;
  transfer_amount: number;
  status: string;
  calculated_at: string;
};

type Overview = {
  period: string;
  status: PeriodStatus;
  doctor_count: number;
  transaction_count: number;
  review_count: number;
  total_bill: number;
  treatment_fee_total: number;
  ortho_fee_total: number;
  total_fee: number;
  deduction: number;
  tax: number;
  transfer_amount: number;
  summaries: DoctorSummary[];
};

type Transaction = {
  id: number;
  transaction_date: string;
  patient_name: string;
  treatment_name_snapshot: string;
  qty: number;
  discount_amount: number;
  bhp_amount: number;
  price_amount: number;
  service_amount: number;
  doctor_fee_amount: number;
  special_fee_amount: number;
  total_bill_amount: number;
  needs_review: boolean;
};

const statusLabel: Record<PeriodStatus, string> = {
  empty: "Belum ada transaksi",
  not_calculated: "Belum dihitung",
  draft: "Draft sudah dihitung",
  locked: "Locked / final",
};

function statusTooltip(status: PeriodStatus | string) {
  if (status === "locked")
    return "Periode sudah final dan transaksi bulan ini tidak bisa diubah.";
  if (status === "draft")
    return "Rekap sudah dihitung, tetapi belum dikunci sebagai final.";
  if (status === "not_calculated")
    return "Transaksi sudah ada, tetapi rekap fee dokter belum dihitung.";
  return "Belum ada transaksi dokter untuk periode ini.";
}

function statusBadge(status: PeriodStatus | string) {
  const badge =
    status === "locked" ? (
      <Badge variant="success">locked</Badge>
    ) : status === "draft" ? (
      <Badge variant="info">draft</Badge>
    ) : status === "not_calculated" ? (
      <Badge variant="secondary">belum dihitung</Badge>
    ) : (
      <Badge variant="secondary">{status}</Badge>
    );
  return <Tooltip content={statusTooltip(status)}>{badge}</Tooltip>;
}

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

export function DoctorFeesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");

  const { data: overview } = useQuery({
    queryKey: ["doctor-period-overview", period],
    queryFn: () => api<Overview>(`/doctor-periods/${period}/overview`),
  });
  const previous = previousPeriod(period);
  const { data: previousOverview } = useQuery({
    queryKey: ["doctor-period-overview", previous],
    queryFn: () => api<Overview>(`/doctor-periods/${previous}/overview`),
  });

  const selectedDoctorQuery = selectedDoctorId
    ? `&doctor_id=${selectedDoctorId}`
    : "";
  const { data: transactions } = useQuery({
    queryKey: ["doctor-fee-transactions", period, selectedDoctorId],
    queryFn: () =>
      api<Transaction[]>(
        `/doctor-transactions?period=${period}${selectedDoctorQuery}`,
      ),
  });

  const calculate = useMutation({
    mutationFn: () =>
      api(`/doctor-periods/${period}/calculate`, { method: "POST" }),
    onSuccess: async () => {
      toasts.add({ title: "Fee dokter selesai dihitung", variant: "success" });
      await queryClient.invalidateQueries({
        queryKey: ["doctor-period-overview", period],
      });
      await queryClient.invalidateQueries({
        queryKey: ["doctor-fee-transactions", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Fee dokter gagal dihitung",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const lock = useMutation({
    mutationFn: () => api(`/doctor-periods/${period}/lock`, { method: "POST" }),
    onSuccess: async () => {
      setLockConfirmOpen(false);
      toasts.add({ title: "Periode fee dokter dikunci", variant: "success" });
      await queryClient.invalidateQueries({
        queryKey: ["doctor-period-overview", period],
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
      api(`/doctor-periods/${period}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password: unlockPassword }),
      }),
    onSuccess: async () => {
      setUnlockConfirmOpen(false);
      setUnlockPassword("");
      toasts.add({
        title: "Periode fee dokter dibuka kuncinya",
        variant: "success",
      });
      await queryClient.invalidateQueries({
        queryKey: ["doctor-period-overview", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Gagal membuka kunci periode",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const generateRandom = useMutation({
    mutationFn: () =>
      api<{ period: string; created: number; calculated: number }>(
        `/doctor-transactions/generate-random?period=${period}&count=42`,
        { method: "POST" },
      ),
    onSuccess: async (result) => {
      toasts.add({
        title: "Data tes riwayat perawatan dibuat",
        description: `${result.created} transaksi random ditambahkan dan ${result.calculated} dokter dihitung ulang.`,
        variant: "success",
      });
      await queryClient.invalidateQueries({
        queryKey: ["doctor-period-overview", period],
      });
      await queryClient.invalidateQueries({
        queryKey: ["doctor-fee-transactions", period],
      });
    },
    onError: (error) =>
      toasts.add({
        title: "Generate data tes gagal",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const filteredSummaries = useMemo(() => {
    return (overview?.summaries ?? []).filter((row) => {
      const matchesSearch =
        !search ||
        [
          row.doctor_name,
          row.bank_name,
          row.account_name,
          row.account_number,
        ].some((value) => includesText(value, search));
      const matchesStatus =
        statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [overview?.summaries, search, statusFilter]);

  const selectedSummary = useMemo(
    () =>
      filteredSummaries.find((row) => row.doctor_id === selectedDoctorId) ??
      filteredSummaries[0],
    [filteredSummaries, selectedDoctorId],
  );

  useEffect(() => {
    if (!filteredSummaries.length) {
      setSelectedDoctorId(null);
      return;
    }
    if (
      !selectedDoctorId ||
      !filteredSummaries.some((row) => row.doctor_id === selectedDoctorId)
    ) {
      setSelectedDoctorId(filteredSummaries[0].doctor_id);
    }
  }, [filteredSummaries, selectedDoctorId]);

  const banner = useMemo(() => {
    if (!overview || overview.status === "empty") {
      return {
        variant: "secondary" as const,
        description: "Belum ada transaksi dokter untuk periode ini.",
      };
    }
    if (overview.review_count > 0) {
      return {
        variant: "alert" as const,
        description: `${overview.review_count} transaksi masih perlu review di Riwayat Perawatan sebelum periode bisa dikunci.`,
      };
    }
    if (overview.status === "locked") {
      return {
        variant: "default" as const,
        description:
          "Periode ini sudah locked. Transaksi bulan ini tidak bisa diubah.",
      };
    }
    if (overview.status === "draft") {
      return {
        variant: "secondary" as const,
        description:
          "Draft sudah dihitung. Cek detail dokter, lalu lock jika angka sudah final.",
      };
    }
    return {
      variant: "secondary" as const,
      description:
        "Transaksi sudah ada. Jalankan Hitung Ulang untuk membuat rekap fee dokter.",
    };
  }, [overview]);

  const comparisonItems = useMemo(
    () => [
      {
        label: "Billing Pasien",
        current: overview?.total_bill ?? 0,
        previous: previousOverview?.total_bill ?? 0,
      },
      {
        label: "Total Fee",
        current: overview?.total_fee ?? 0,
        previous: previousOverview?.total_fee ?? 0,
      },
      {
        label: "Transfer",
        current: overview?.transfer_amount ?? 0,
        previous: previousOverview?.transfer_amount ?? 0,
      },
      {
        label: "Pajak",
        current: overview?.tax ?? 0,
        previous: previousOverview?.tax ?? 0,
      },
    ],
    [overview, previousOverview],
  );

  const feeChartOptions = useMemo<KumoChartOption>(
    () => ({
      color: [ChartPalette.categorical(0), ChartPalette.semantic("Success")],
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: ChartPalette.text("secondary"), fontSize: 11 },
      },
      grid: { left: 108, right: 24, top: 34, bottom: 8 },
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

  async function exportWorkbook() {
    try {
      await downloadFile(
        `/reports/doctor-fees?period=${period}&format=xlsx`,
        `doctor-fees-${period}.xlsx`,
      );
    } catch (error) {
      toasts.add({
        title: "Export fee dokter gagal",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  async function exportPdf() {
    try {
      await downloadFile(
        `/reports/doctor-fees?period=${period}&format=pdf`,
        `doctor-fees-${period}.pdf`,
      );
    } catch (error) {
      toasts.add({
        title: "Export PDF fee dokter gagal",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  async function exportPdfZip() {
    try {
      await downloadFile(
        `/reports/doctor-fees?period=${period}&format=zip`,
        `doctor-fees-${period}-per-dokter.zip`,
      );
    } catch (error) {
      toasts.add({
        title: "Export ZIP fee dokter gagal",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  function openTreatmentHistory(doctorId?: number) {
    const params = new URLSearchParams({ period });
    if (doctorId) params.set("doctor_id", String(doctorId));
    navigate(`/treatment-history?${params.toString()}`);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Fee Dokter</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review rekap, detail transaksi, lock periode, dan export XLSX.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input
            className="w-40"
            aria-label="Periode fee dokter"
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
                overview?.review_count !== 0 || !overview?.summaries.length
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
                ZIP PDF per dokter
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
          {isDevelopmentEnvironment ? (
            <Button
              variant="secondary"
              icon={<Database size={18} />}
              loading={generateRandom.isPending}
              disabled={overview?.status === "locked"}
              onClick={() => generateRandom.mutate()}
            >
              Generate Data Tes
            </Button>
          ) : null}
        </div>
      </div>

      <Banner variant={banner.variant} description={banner.description} />

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text as="h2" variant="heading3">
              Rekap Fee Dokter
            </Text>
            <p className="mt-1 text-sm text-kumo-subtle">
              {statusLabel[overview?.status ?? "empty"]} untuk periode {period}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Jumlah transaksi yang masih perlu dicek karena treatment/master data belum cocok. Harus 0 sebelum periode bisa di-lock.">
              <Badge variant={overview?.review_count ? "error" : "success"}>
                {overview?.review_count ?? 0} review
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
                  Membandingkan {period} dengan {previous} untuk metrik rekap
                  utama.
                </p>
              </div>
              {previousOverview?.status
                ? statusBadge(previousOverview.status)
                : null}
            </div>
            <Chart
              echarts={echarts}
              options={feeChartOptions}
              height={188}
              aria-label="Grafik komposisi nominal fee dokter"
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
              aria-label="Cari rekap dokter"
              className="flex-1"
              placeholder="Cari dokter, bank, atau rekening..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            className="w-44"
            aria-label="Filter status fee dokter"
            value={statusFilter}
            renderValue={(value) =>
              value === "locked"
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
          </Select>
        </div>

        <DataTable
          rows={filteredSummaries}
          pagination
          pageSize={25}
          minTableWidth={1500}
          rowKey={(row) => row.doctor_id}
          selectable
          selectedKeys={new Set(selectedDoctorId ? [selectedDoctorId] : [])}
          onToggleRow={(row) => setSelectedDoctorId(row.doctor_id)}
          onTogglePage={(rows) =>
            rows[0] && setSelectedDoctorId(rows[0].doctor_id)
          }
          columns={[
            {
              key: "doctor",
              header: "Dokter",
              render: (row) => row.doctor_name,
            },
            {
              key: "count",
              header: "Transaksi",
              align: "right",
              render: (row) => row.transaction_count,
            },
            {
              key: "bill",
              header: "Total Bill Pasien",
              align: "right",
              render: (row) => rupiah.format(row.total_bill),
            },
            {
              key: "treatment",
              header: "Fee Perawatan",
              align: "right",
              render: (row) => rupiah.format(row.treatment_fee_total),
            },
            {
              key: "ortho",
              header: "Fee Ortho/Behel",
              align: "right",
              render: (row) => rupiah.format(row.ortho_fee_total),
            },
            {
              key: "fee",
              header: "Total Fee",
              align: "right",
              render: (row) => rupiah.format(row.total_fee),
            },
            {
              key: "deduction",
              header: "Potongan",
              align: "right",
              render: (row) => rupiah.format(row.deduction),
            },
            {
              key: "tax",
              header: "Pajak",
              align: "right",
              render: (row) => rupiah.format(row.tax),
            },
            {
              key: "transfer",
              header: "Nominal Transfer",
              align: "right",
              render: (row) => (
                <strong>{rupiah.format(row.transfer_amount)}</strong>
              ),
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
              render: (row) => statusBadge(row.status),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              sticky: "right",
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
                          aria-label={`Aksi ${row.doctor_name}`}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      }
                    />
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        icon={<Eye className="mr-2" size={16} />}
                        onClick={() => setSelectedDoctorId(row.doctor_id)}
                      >
                        Lihat detail
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        icon={<ExternalLink className="mr-2" size={16} />}
                        onClick={() => openTreatmentHistory(row.doctor_id)}
                      >
                        Buka transaksi
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Text as="h2" variant="heading3">
              Detail Transaksi Dokter
            </Text>
            <p className="mt-1 text-sm text-kumo-subtle">
              {selectedSummary
                ? selectedSummary.doctor_name
                : "Pilih dokter dari tabel rekap."}
            </p>
          </div>
          {selectedSummary ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={16} />}
              onClick={() => openTreatmentHistory(selectedSummary.doctor_id)}
            >
              Koreksi transaksi
            </Button>
          ) : null}
        </div>

        <DataTable
          rows={transactions ?? []}
          pagination
          pageSize={25}
          minTableWidth={1850}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "date",
              header: "Tanggal",
              render: (row) => row.transaction_date,
            },
            {
              key: "patient",
              header: "Nama Pasien",
              render: (row) => row.patient_name,
            },
            {
              key: "treatment",
              header: "Perawatan",
              render: (row) => row.treatment_name_snapshot,
            },
            {
              key: "bhp",
              header: "BHP",
              align: "right",
              render: (row) => rupiah.format(row.bhp_amount),
            },
            {
              key: "price",
              header: "Biaya Perawatan",
              align: "right",
              render: (row) => rupiah.format(row.price_amount),
            },
            {
              key: "qty",
              header: "Qty",
              align: "right",
              render: (row) => row.qty,
            },
            {
              key: "discount",
              header: "Diskon",
              align: "right",
              render: (row) => rupiah.format(row.discount_amount),
            },
            {
              key: "service",
              header: "Biaya Jasa",
              align: "right",
              render: (row) => rupiah.format(row.service_amount),
            },
            {
              key: "fee",
              header: "Fee Dokter",
              align: "right",
              render: (row) => rupiah.format(row.doctor_fee_amount),
            },
            {
              key: "special",
              header: "Fee Khusus Behel",
              align: "right",
              render: (row) => rupiah.format(row.special_fee_amount),
            },
            {
              key: "bill",
              header: "Total Biaya",
              align: "right",
              render: (row) => (
                <strong>{rupiah.format(row.total_bill_amount)}</strong>
              ),
            },
            {
              key: "review",
              header: "Status Review",
              render: (row) =>
                row.needs_review ? (
                  <Badge variant="error">review</Badge>
                ) : (
                  <Badge variant="success">ok</Badge>
                ),
            },
          ]}
        />
      </LayerCard>
      <ConfirmActionDialog
        open={lockConfirmOpen}
        title="Kunci Periode Fee Dokter?"
        description={`Periode ${period} akan dikunci. Setelah dikunci, transaksi dan rekap fee dokter pada periode ini tidak bisa diubah. Pastikan semua data sudah benar sebelum mengunci.`}
        confirmLabel="Kunci Periode"
        icon={AlertTriangle}
        isPending={lock.isPending}
        onOpenChange={setLockConfirmOpen}
        onConfirm={() => lock.mutate()}
      />

      <ConfirmActionDialog
        open={unlockConfirmOpen}
        title="Buka Kunci Periode Fee Dokter?"
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
