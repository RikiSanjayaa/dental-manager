import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  History,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable } from "../components/DataTable";
import { api, rupiah } from "../lib/api";
import { useCurrentUser } from "../lib/auth";

type RecentAttendance = {
  id: number;
  work_date: string;
  total_minutes: number;
  overtime_minutes: number;
  needs_review: boolean;
  protest_note?: string | null;
  status_note?: string | null;
};

type RecentTreatment = {
  id: number;
  transaction_date: string;
  doctor_name: string;
  patient_name: string;
  treatment_name: string;
  total_bill_amount: number;
  needs_review: boolean;
};

type RecentAudit = {
  id: number;
  action: string;
  entity_type: string;
  description: string;
  created_at: string;
};

type OperatorDashboard = {
  period: string;
  employee: {
    id: number;
    name: string;
    position?: string | null;
    attendance_id?: string | null;
  };
  payroll?: {
    status: string;
    net_salary: number;
    gross_salary: number;
    total_deduction: number;
    overtime_minutes: number;
    needs_review: boolean;
  } | null;
  attendance_count: number;
  attendance_review_count: number;
  protest_count: number;
  overtime_minutes: number;
  treatment_count: number;
  treatment_review_count: number;
  recent_treatments: RecentTreatment[];
  recent_audit_logs: RecentAudit[];
  recent_attendance: RecentAttendance[];
};

const statusText: Record<string, string> = {
  ready: "aman",
  needs_review: "perlu review",
  draft: "draft",
  locked: "locked",
  empty: "kosong",
  not_calculated: "belum dihitung",
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function statusBadge(status: string) {
  if (status === "locked" || status === "ready") return <Badge variant="success">{statusText[status]}</Badge>;
  if (status === "draft" || status === "login" || status === "logout") return <Badge variant="info">{statusText[status] ?? status}</Badge>;
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

export function OperatorDashboardPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [period, setPeriod] = useState(currentPeriod());
  const { data, isError, error } = useQuery({
    queryKey: ["operator-dashboard", period],
    queryFn: () => api<OperatorDashboard>(`/me/dashboard?period=${period}`),
  });

  const readiness = (data?.attendance_review_count ?? 0) + (data?.treatment_review_count ?? 0) > 0 ? "needs_review" : "ready";
  const workflow = useMemo(
    () => [
      {
        title: "Riwayat Perawatan",
        description: `${data?.treatment_count ?? 0} transaksi bulan ini`,
        status: (data?.treatment_review_count ?? 0) ? "needs_review" : "ready",
        meta: `${data?.treatment_review_count ?? 0} review`,
        path: `/treatment-history?period=${period}`,
        icon: ClipboardCheck,
      },
      {
        title: "Absensi",
        description: `${data?.attendance_count ?? 0} baris absensi`,
        status: (data?.attendance_review_count ?? 0) ? "needs_review" : "ready",
        meta: `${data?.protest_count ?? 0} protes`,
        path: `/attendance?period=${period}`,
        icon: Clock3,
      },
      {
        title: "Payroll Saya",
        description: rupiah.format(data?.payroll?.net_salary ?? 0),
        status: data?.payroll?.needs_review ? "needs_review" : data?.payroll?.status ?? "not_calculated",
        meta: `${data?.overtime_minutes ?? 0} menit lembur`,
        path: `/my-payroll?period=${period}`,
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
    [data, period],
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold text-kumo-default">Dashboard Operator</h1>
          <p className="mt-1 text-sm text-kumo-subtle">
            {data?.employee.name ?? user.employee_name ?? user.full_name}
            {data?.employee.position ? ` - ${data.employee.position}` : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
          Periode
          <Input className="w-40" aria-label="Periode dashboard operator" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
      </div>

      {isError ? (
        <LayerCard className="p-4">
          <div className="flex items-start gap-3 text-kumo-danger">
            <AlertCircle size={20} />
            <p className="text-sm">{error instanceof Error ? error.message : "Dashboard operator belum bisa dimuat."}</p>
          </div>
        </LayerCard>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Riwayat Perawatan", value: String(data?.treatment_count ?? 0), icon: WalletCards, badge: `${data?.treatment_review_count ?? 0} review`, tone: "dashboard-icon-success" },
          { label: "Absensi", value: String(data?.attendance_count ?? 0), icon: CalendarClock, badge: `${data?.protest_count ?? 0} protes`, tone: "dashboard-icon-info" },
          { label: "Payroll Saya", value: rupiah.format(data?.payroll?.net_salary ?? 0), icon: Banknote, badge: statusText[data?.payroll?.status ?? "not_calculated"], tone: "dashboard-icon-warning" },
          { label: "Audit Akun", value: String(data?.recent_audit_logs?.length ?? 0), icon: History, badge: "aktivitas", tone: "dashboard-icon-danger" },
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
                <Text as="h2" variant="heading3">Riwayat Perawatan Terbaru</Text>
                <Text variant="secondary" size="sm">Cek transaksi terbaru agar input tidak dobel.</Text>
              </div>
              <Button variant="ghost" size="sm" icon={<ClipboardCheck size={16} />} onClick={() => navigate(`/treatment-history?period=${period}`)}>
                Buka Riwayat
              </Button>
            </div>
            <DataTable
              rows={data?.recent_treatments ?? []}
              minTableWidth={640}
              rowKey={(row) => row.id}
              empty="Belum ada riwayat perawatan pada periode ini."
              columns={[
                { key: "date", header: "Tanggal", render: (row) => row.transaction_date },
                { key: "patient", header: "Pasien", render: (row) => row.patient_name },
                { key: "treatment", header: "Treatment", render: (row) => row.treatment_name },
                { key: "doctor", header: "Dokter", render: (row) => row.doctor_name },
                { key: "bill", header: "Billing", align: "right", render: (row) => rupiah.format(row.total_bill_amount) },
                { key: "status", header: "", render: (row) => row.needs_review ? statusBadge("needs_review") : statusBadge("ready") },
              ]}
            />
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
                        <Tooltip content={item.meta}>{statusBadge(item.status)}</Tooltip>
                      </div>
                      <p className="truncate text-sm text-kumo-subtle">{item.description}</p>
                    </div>
                  </div>
                  {item.path !== "/" ? (
                    <Button size="sm" variant="ghost" shape="square" aria-label={`Buka ${item.title}`} onClick={() => navigate(item.path)}>
                      <ArrowRight size={16} />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </LayerCard>
        </GridItem>
      </Grid>

      <div className="grid gap-4 md:grid-cols-2">
        <LayerCard className="flex flex-col gap-3 p-4">
          <div>
            <Text as="h2" variant="heading3">Absensi Terbaru</Text>
          </div>
          <DataTable
            rows={(data?.recent_attendance ?? []).slice(0, 3)}
            minTableWidth={520}
            rowKey={(row) => row.id}
            empty="Belum ada absensi untuk periode ini."
            columns={[
              { key: "date", header: "Tanggal", render: (row) => row.work_date },
              { key: "total", header: "Total", align: "right", render: (row) => `${row.total_minutes} min` },
              { key: "overtime", header: "Lembur", align: "right", render: (row) => `${row.overtime_minutes} min` },
              { key: "status", header: "", render: (row) => row.needs_review ? statusBadge("needs_review") : statusBadge("ready") },
            ]}
          />
        </LayerCard>

        <LayerCard className="mb-6 flex flex-col gap-3 p-4">
          <div>
            <Text as="h2" variant="heading3">Audit Akun Saya</Text>
          </div>
          <DataTable
            rows={(data?.recent_audit_logs ?? []).slice(0, 5)}
            minTableWidth={520}
            rowKey={(row) => row.id}
            empty="Belum ada audit log untuk akun ini."
            columns={[
              { key: "time", header: "Waktu", render: (row) => formatDateTime(row.created_at) },
              { key: "description", header: "Aktivitas", render: (row) => row.description },
              { key: "action", header: "", render: (row) => statusBadge(row.action) },
            ]}
          />
        </LayerCard>
      </div>
    </>
  );
}
