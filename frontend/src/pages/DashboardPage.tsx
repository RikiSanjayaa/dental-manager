import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CalendarDays, ReceiptText, Stethoscope, Users } from "lucide-react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { api, rupiah } from "../lib/api";

type Dashboard = {
  totals: {
    doctor_fee: number;
    payroll: number;
    employees: number;
    doctor_transactions: number;
    attendance_needs_review: number;
  };
  recent_imports: Array<{ id: number; original_filename: string; kind: string; status: string; rows_valid: number; warnings_count: number }>;
};

export function DashboardPage() {
  const period = new Date().toISOString().slice(0, 7);
  const { data } = useQuery({ queryKey: ["dashboard", period], queryFn: () => api<Dashboard>(`/dashboard?period=${period}`) });
  const totals = data?.totals;

  return (
    <>
      <PageHeader title="Dashboard Operasional" eyebrow={`Periode ${period}`} />
      <Grid variant="4up" gap="sm">
        <GridItem><StatCard label="Fee Dokter" value={rupiah.format(totals?.doctor_fee ?? 0)} icon={Stethoscope} tone="green" /></GridItem>
        <GridItem><StatCard label="Payroll" value={rupiah.format(totals?.payroll ?? 0)} icon={Banknote} tone="blue" /></GridItem>
        <GridItem><StatCard label="Karyawan" value={String(totals?.employees ?? 0)} icon={Users} tone="amber" /></GridItem>
        <GridItem><StatCard label="Butuh Review" value={String(totals?.attendance_needs_review ?? 0)} icon={AlertTriangle} tone="red" /></GridItem>
      </Grid>
      <LayerCard className="p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <Text as="h2" variant="heading3">Import Terakhir</Text>
            <Text variant="secondary" size="sm">Audit file sumber sebelum data masuk ke perhitungan.</Text>
          </div>
          <CalendarDays className="text-kumo-subtle" size={20} />
        </div>
        <DataTable
          rows={data?.recent_imports ?? []}
          columns={[
            { key: "file", header: "File", render: (row) => row.original_filename },
            { key: "kind", header: "Jenis", render: (row) => row.kind },
            { key: "status", header: "Status", render: (row) => <Badge variant="success" appearance="dot">{row.status}</Badge> },
            { key: "rows", header: "Valid", align: "right", render: (row) => row.rows_valid },
            { key: "warnings", header: "Warnings", align: "right", render: (row) => row.warnings_count },
          ]}
        />
      </LayerCard>
      <Banner
        variant="secondary"
        icon={<ReceiptText size={20} />}
        title="Alur kerja V1"
        description="Import file, review data, calculate periode, lock, lalu export laporan."
      />
    </>
  );
}
