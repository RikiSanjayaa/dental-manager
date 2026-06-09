import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Chart, ChartPalette, type KumoChartOption } from "@cloudflare/kumo/components/chart";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  ReceiptText,
  Stethoscope,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable } from "../components/DataTable";
import { api, rupiah } from "../lib/api";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type PeriodStatus = "empty" | "not_calculated" | "draft" | "locked";
type ReadinessStatus = "ready" | "needs_review" | "not_calculated" | "final";

type DashboardTotals = {
  billing_patient: number;
  doctor_fee_transfer: number;
  payroll_transfer: number;
  review_total: number;
  doctor_transactions: number;
  attendance_records: number;
  active_employees: number;
  overtime_records: number;
  doctor_fee_status: PeriodStatus;
  payroll_status: PeriodStatus;
  treatment_review_count: number;
  attendance_review_count: number;
  payroll_review_count: number;
};

type Dashboard = {
  period: string;
  previous_period: string;
  totals: DashboardTotals;
  previous_totals: DashboardTotals;
  status: {
    readiness: ReadinessStatus;
    doctor_fee: PeriodStatus;
    payroll: PeriodStatus;
  };
  work_queue: {
    treatment_review_count: number;
    attendance_review_count: number;
    payroll_review_count: number;
  };
  top_doctors: Array<{
    doctor_id: number;
    doctor_name: string;
    transaction_count: number;
    total_bill: number;
    transfer_amount: number;
    status: string;
  }>;
  top_overtime_employees: Array<{
    employee_id: number | null;
    employee_name: string;
    overtime_minutes: number;
    overtime_total: number;
    status: string;
  }>;
  recent_activity: Array<{
    id: string;
    kind: "import" | "export";
    label: string;
    category: string;
    status: string;
    format: string;
    created_at: string;
  }>;
};

const statusText: Record<string, string> = {
  empty: "kosong",
  not_calculated: "belum dihitung",
  draft: "draft",
  locked: "locked",
  ready: "aman",
  needs_review: "perlu review",
  final: "final",
};

function previousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function statusBadge(status: string) {
  if (status === "locked" || status === "final" || status === "ready") return <Badge variant="success">{statusText[status] ?? status}</Badge>;
  if (status === "draft") return <Badge variant="info">draft</Badge>;
  if (status === "needs_review") return <Badge variant="error">perlu review</Badge>;
  return <Badge variant="secondary">{statusText[status] ?? status}</Badge>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const previous = previousPeriod(period);
  const { data } = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => api<Dashboard>(`/dashboard?period=${period}`),
  });

  const totals = data?.totals;
  const previousTotals = data?.previous_totals;
  const readiness = data?.status.readiness ?? "not_calculated";

  const comparisonItems = useMemo(
    () => [
      { label: "Billing Pasien", current: totals?.billing_patient ?? 0, previous: previousTotals?.billing_patient ?? 0 },
      { label: "Fee Dokter", current: totals?.doctor_fee_transfer ?? 0, previous: previousTotals?.doctor_fee_transfer ?? 0 },
      { label: "Payroll", current: totals?.payroll_transfer ?? 0, previous: previousTotals?.payroll_transfer ?? 0 },
      { label: "Review", current: totals?.review_total ?? 0, previous: previousTotals?.review_total ?? 0 },
    ],
    [totals, previousTotals],
  );

  const chartOptions = useMemo<KumoChartOption>(
    () => ({
      color: [ChartPalette.categorical(0), ChartPalette.semantic("Success")],
      legend: { top: 0, right: 0, textStyle: { color: ChartPalette.text("secondary"), fontSize: 11 } },
      grid: { left: 108, right: 18, top: 34, bottom: 8 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#e5e7eb" } },
        axisLabel: { color: ChartPalette.text("secondary"), fontSize: 11 },
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
        { name: period, type: "bar", data: comparisonItems.map((item) => item.current), barWidth: 12, itemStyle: { borderRadius: 4 } },
        { name: previous, type: "bar", data: comparisonItems.map((item) => item.previous), barWidth: 12, itemStyle: { borderRadius: 4 } },
      ],
    }),
    [comparisonItems, period, previous],
  );

  const workflow = [
    {
      title: "Riwayat Perawatan",
      description: `${totals?.doctor_transactions ?? 0} transaksi bulan ini`,
      status: (totals?.treatment_review_count ?? 0) ? "needs_review" : "ready",
      meta: `${totals?.treatment_review_count ?? 0} review`,
      path: `/treatment-history?period=${period}`,
      icon: ClipboardCheck,
    },
    {
      title: "Fee Dokter",
      description: rupiah.format(totals?.doctor_fee_transfer ?? 0),
      status: data?.status.doctor_fee ?? "empty",
      meta: "rekap dokter",
      path: `/doctor-fees?period=${period}`,
      icon: Stethoscope,
    },
    {
      title: "Absensi",
      description: `${totals?.attendance_records ?? 0} baris absensi`,
      status: (totals?.attendance_review_count ?? 0) ? "needs_review" : "ready",
      meta: `${totals?.overtime_records ?? 0} lembur`,
      path: `/attendance?period=${period}`,
      icon: Clock3,
    },
    {
      title: "Payroll",
      description: rupiah.format(totals?.payroll_transfer ?? 0),
      status: data?.status.payroll ?? "empty",
      meta: `${totals?.payroll_review_count ?? 0} review`,
      path: `/payroll?period=${period}`,
      icon: ReceiptText,
    },
  ];

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold text-kumo-default">Dashboard</h1>
          <p className="mt-1 text-sm text-kumo-subtle">Ringkasan bulan berjalan</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
          Periode
          <Input className="w-40" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Billing Pasien", value: rupiah.format(totals?.billing_patient ?? 0), icon: WalletCards, badge: `${totals?.doctor_transactions ?? 0} trx`, tone: "text-kumo-success bg-kumo-success-tint" },
          { label: "Fee Dokter", value: rupiah.format(totals?.doctor_fee_transfer ?? 0), icon: Stethoscope, badge: statusText[data?.status.doctor_fee ?? "empty"], tone: "text-kumo-info bg-kumo-info-tint" },
          { label: "Payroll", value: rupiah.format(totals?.payroll_transfer ?? 0), icon: Banknote, badge: statusText[data?.status.payroll ?? "empty"], tone: "text-kumo-warning bg-kumo-warning-tint" },
          { label: "Review", value: String(totals?.review_total ?? 0), icon: AlertTriangle, badge: statusText[readiness], tone: "text-kumo-danger bg-kumo-danger-tint" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <LayerCard key={item.label} className="flex min-h-20 items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Text as="span" variant="secondary" size="sm">{item.label}</Text>
                  <Badge variant="secondary">{item.badge}</Badge>
                </div>
                <div className="truncate text-lg font-semibold text-kumo-default">{item.value}</div>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full ${item.tone}`}>
                <Icon size={18} />
              </div>
            </LayerCard>
          );
        })}
      </div>

      <Grid variant="2-1" gap="sm">
        <GridItem>
          <LayerCard className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Text as="h2" variant="heading3">Perbandingan Bulanan</Text>
                <Text variant="secondary" size="sm">{period} vs {data?.previous_period ?? previous}</Text>
              </div>
              <Button variant="ghost" size="sm" icon={<TrendingUp size={16} />} onClick={() => navigate(`/doctor-fees?period=${period}`)}>
                Fee Dokter
              </Button>
            </div>
            <Chart echarts={echarts} options={chartOptions} height={210} aria-label="Grafik perbandingan dashboard bulanan" />
          </LayerCard>
        </GridItem>

        <GridItem>
          <LayerCard className="flex h-full flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Text as="h2" variant="heading3">Status Workflow</Text>
              {statusBadge(readiness)}
            </div>
            {workflow.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center justify-between gap-3 rounded-md border border-kumo-hairline bg-kumo-base px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-kumo-tint text-kumo-default">
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text as="strong" variant="body" bold>{item.title}</Text>
                        <Tooltip content={item.meta}>{statusBadge(item.status)}</Tooltip>
                      </div>
                      <p className="truncate text-sm text-kumo-subtle">{item.description}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" shape="square" aria-label={`Buka ${item.title}`} onClick={() => navigate(item.path)}>
                    <ArrowRight size={16} />
                  </Button>
                </div>
              );
            })}
          </LayerCard>
        </GridItem>
      </Grid>

      <div className="grid gap-4 lg:grid-cols-3">
        <LayerCard className="flex flex-col gap-3 p-4">
          <div>
            <Text as="h2" variant="heading3">Top Dokter Bulan Ini</Text>
          </div>
          <DataTable
            rows={(data?.top_doctors ?? []).slice(0, 3)}
            minTableWidth={360}
            rowKey={(row) => row.doctor_id}
            empty="Belum ada transaksi dokter untuk periode ini."
            columns={[
              { key: "doctor", header: "Dokter", render: (row) => row.doctor_name },
              { key: "bill", header: "Billing", align: "right", render: (row) => rupiah.format(row.total_bill) },
              { key: "status", header: "", render: (row) => statusBadge(row.status) },
            ]}
          />
        </LayerCard>

        <LayerCard className="flex flex-col gap-3 p-4">
          <div>
            <Text as="h2" variant="heading3">Lembur Karyawan</Text>
          </div>
          <DataTable
            rows={(data?.top_overtime_employees ?? []).slice(0, 3)}
            minTableWidth={320}
            rowKey={(row) => row.employee_id ?? row.employee_name}
            empty="Belum ada lembur pada periode ini."
            columns={[
              { key: "employee", header: "Karyawan", render: (row) => row.employee_name },
              { key: "minutes", header: "Menit", align: "right", render: (row) => `${row.overtime_minutes} min` },
              { key: "status", header: "", render: (row) => statusBadge(row.status) },
            ]}
          />
        </LayerCard>

        <LayerCard className="mb-6 flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <Text as="h2" variant="heading3">Aktivitas Terbaru</Text>
          <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={16} />} onClick={() => navigate("/reports")}>
            Laporan
          </Button>
          </div>
          <DataTable
            rows={(data?.recent_activity ?? []).slice(0, 3)}
            minTableWidth={380}
            rowKey={(row) => row.id}
            empty="Belum ada aktivitas terbaru."
            columns={[
              { key: "time", header: "Waktu", render: (row) => formatDateTime(row.created_at) },
              { key: "label", header: "File", render: (row) => row.label },
              { key: "kind", header: "", render: (row) => <Badge variant={row.kind === "export" ? "info" : "success"}>{row.kind}</Badge> },
            ]}
          />
        </LayerCard>
      </div>
    </>
  );
}
