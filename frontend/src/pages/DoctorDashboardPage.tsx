import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Chart, ChartPalette, type KumoChartOption } from "@cloudflare/kumo/components/chart";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useQuery } from "@tanstack/react-query";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  History,
  ReceiptText,
  Stethoscope,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DataTable } from "../components/DataTable";
import { api, rupiah } from "../lib/api";
import { useCurrentUser } from "../lib/auth";
import { formatWitaDateTime } from "../lib/datetime";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type PeriodStatus = "empty" | "not_calculated" | "draft" | "locked";

type DashboardSummary = {
  status: PeriodStatus;
  treatment_fee_total: number;
  ortho_fee_total: number;
  total_fee: number;
  total_bill: number;
  deduction: number;
  tax: number;
  transfer_amount: number;
  calculated_at: string | null;
  transaction_count: number;
  review_count: number;
};

type RecentTransaction = {
  id: number;
  transaction_date: string;
  patient_name: string;
  treatment_name_snapshot?: string | null;
  treatment_name?: string | null;
  doctor_fee_amount: number;
  total_bill_amount: number;
  needs_review: boolean;
};

type RecentAudit = {
  id: number;
  action: string;
  entity_type: string | null;
  description: string;
  created_at: string;
};

type DoctorDashboard = {
  period: string;
  doctor: {
    id: number;
    name: string;
  };
  summary: DashboardSummary;
  previous: DashboardSummary | null;
  recent_transactions: RecentTransaction[];
  recent_audit_logs: RecentAudit[];
};

const statusText: Record<string, string> = {
  empty: "kosong",
  not_calculated: "belum dihitung",
  draft: "draft",
  locked: "locked",
  ready: "aman",
  needs_review: "perlu review",
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function previousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function statusBadge(status: string) {
  if (status === "locked" || status === "ready") return <Badge variant="success">{statusText[status] ?? status}</Badge>;
  if (status === "draft" || status === "login" || status === "logout") return <Badge variant="info">{statusText[status] ?? status}</Badge>;
  if (status === "needs_review") return <Badge variant="error">perlu review</Badge>;
  return <Badge variant="secondary">{statusText[status] ?? status}</Badge>;
}

function formatDateTime(value: string) {
  return formatWitaDateTime(value, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DoctorDashboardPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState(params.get("period") || "");
  const { data, isError, error } = useQuery({
    queryKey: ["doctor-dashboard", period || "latest"],
    queryFn: () => api<DoctorDashboard>(period ? `/me/doctor-dashboard?period=${period}` : "/me/doctor-dashboard"),
  });

  useEffect(() => {
    if (!period && data?.period) setPeriod(data.period);
  }, [data?.period, period]);

  const activePeriod = period || data?.period || currentPeriod();
  const previousLabel = previousPeriod(activePeriod);
  const readiness = (data?.summary.review_count ?? 0) > 0 ? "needs_review" : "ready";

  const comparisonItems = useMemo(
    () => [
      { label: "Fee Dokter", current: data?.summary.treatment_fee_total ?? 0, previous: data?.previous?.treatment_fee_total ?? 0 },
      { label: "Fee Behel", current: data?.summary.ortho_fee_total ?? 0, previous: data?.previous?.ortho_fee_total ?? 0 },
      { label: "Tagihan Pasien", current: data?.summary.total_bill ?? 0, previous: data?.previous?.total_bill ?? 0 },
      { label: "Total Transfer", current: data?.summary.transfer_amount ?? 0, previous: data?.previous?.transfer_amount ?? 0 },
    ],
    [data],
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
        { name: activePeriod, type: "bar", data: comparisonItems.map((item) => item.current), barWidth: 12, itemStyle: { borderRadius: 4 } },
        { name: previousLabel, type: "bar", data: comparisonItems.map((item) => item.previous), barWidth: 12, itemStyle: { borderRadius: 4 } },
      ],
    }),
    [activePeriod, comparisonItems, previousLabel],
  );

  const workflow = useMemo(
    () => [
      {
        title: "Fee Dokter Saya",
        description: rupiah.format(data?.summary.transfer_amount ?? 0),
        status: data?.summary.status ?? "empty",
        meta: `${data?.summary.review_count ?? 0} review`,
        path: "/my-doctor-fees",
        icon: ReceiptText,
      },
      {
        title: "Audit Akun",
        description: `${data?.recent_audit_logs?.length ?? 0} aktivitas terakhir`,
        status: "ready",
        meta: "login, logout, dan aksi akun",
        path: "/my-audit-logs",
        icon: History,
      },
    ],
    [data],
  );

  function changePeriod(value: string) {
    setPeriod(value);
    setParams({ period: value });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold text-kumo-default">Dashboard Dokter</h1>
          <p className="mt-1 text-sm text-kumo-subtle">
            {data?.doctor.name ?? user.full_name} - ringkasan fee dokter
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
          Periode
          <Input className="w-40" aria-label="Periode dashboard dokter" type="month" value={activePeriod} onChange={(event) => changePeriod(event.target.value)} />
        </label>
      </div>

      {isError ? (
        <LayerCard className="p-4">
          <p className="text-sm text-kumo-danger">{error instanceof Error ? error.message : "Dashboard dokter belum bisa dimuat."}</p>
        </LayerCard>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Transfer", value: rupiah.format(data?.summary.transfer_amount ?? 0), icon: Banknote, badge: statusText[data?.summary.status ?? "empty"], tone: "dashboard-icon-warning" },
          { label: "Total Fee", value: rupiah.format(data?.summary.total_fee ?? 0), icon: Stethoscope, badge: `${data?.summary.transaction_count ?? 0} trx`, tone: "dashboard-icon-info" },
          { label: "Transaksi", value: String(data?.summary.transaction_count ?? 0), icon: WalletCards, badge: "periode ini", tone: "dashboard-icon-success" },
          { label: "Review", value: String(data?.summary.review_count ?? 0), icon: AlertTriangle, badge: (data?.summary.review_count ?? 0) > 0 ? "perlu review" : "aman", tone: "dashboard-icon-danger" },
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
                <Text variant="secondary" size="sm">{data?.period ?? activePeriod} vs {previousLabel}</Text>
              </div>
              <Button variant="ghost" size="sm" icon={<ReceiptText size={16} />} onClick={() => navigate("/my-doctor-fees")}>
                Fee Dokter Saya
              </Button>
            </div>
            {data?.previous ? (
              <Chart echarts={echarts} options={chartOptions} height={210} aria-label="Grafik perbandingan pendapatan dokter bulanan" />
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-kumo-subtle">
                Belum ada data fee dokter pada periode {previousLabel} untuk dibandingkan.
              </div>
            )}
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
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full dashboard-icon-info">
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text as="strong" variant="body" bold>{item.title}</Text>
                        {statusBadge(item.status)}
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

      <Grid variant="2-1" gap="sm">
        <GridItem>
          <LayerCard className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Text as="h2" variant="heading3">Transaksi Terbaru Saya</Text>
                <p className="mt-1 text-sm text-kumo-subtle">Transaksi perawatan terbaru atas nama Anda.</p>
              </div>
              <Button variant="ghost" size="sm" icon={<ReceiptText size={16} />} onClick={() => navigate("/my-doctor-fees")}>
                Fee Dokter Saya
              </Button>
            </div>
            <DataTable
              rows={data?.recent_transactions ?? []}
              minTableWidth={760}
              rowKey={(row) => row.id}
              empty="Belum ada transaksi untuk akun ini."
              columns={[
                { key: "date", header: "Tanggal", render: (row) => row.transaction_date },
                { key: "patient", header: "Pasien", render: (row) => row.patient_name },
                { key: "treatment", header: "Perawatan", render: (row) => row.treatment_name_snapshot ?? row.treatment_name ?? "-" },
                { key: "fee", header: "Fee Dokter", align: "right", render: (row) => rupiah.format(row.doctor_fee_amount) },
                { key: "bill", header: "Total Biaya", align: "right", render: (row) => <strong>{rupiah.format(row.total_bill_amount)}</strong> },
                { key: "status", header: "", render: (row) => (row.needs_review ? <Badge variant="error">review</Badge> : <Badge variant="success">ok</Badge>) },
              ]}
            />
          </LayerCard>
        </GridItem>

        <GridItem>
          <LayerCard className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <Text as="h2" variant="heading3">Aktivitas Akun Saya</Text>
              <Button variant="secondary" size="sm" icon={<History size={16} />} onClick={() => navigate("/my-audit-logs")}>
                Audit Akun
              </Button>
            </div>
            <DataTable
              rows={(data?.recent_audit_logs ?? []).slice(0, 5)}
              minTableWidth={380}
              rowKey={(row) => row.id}
              empty="Belum ada aktivitas audit untuk akun ini."
              columns={[
                { key: "time", header: "Waktu", render: (row) => formatDateTime(row.created_at) },
                { key: "description", header: "Aktivitas", render: (row) => row.description },
                { key: "action", header: "", render: (row) => statusBadge(row.action) },
              ]}
            />
          </LayerCard>
        </GridItem>
      </Grid>
    </>
  );
}
