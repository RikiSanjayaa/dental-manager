import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";

type PayrollRule = { id: number; name: string; is_default: boolean; bpjs_jht_rate: number; overtime_rate_per_minute: number; pph21_threshold: number; pph21_rate: number };
type DoctorFeeRule = { id: number; name: string; is_default: boolean; normal_fee_rate: number; ortho_fee_rate: number; tax_rate: number; default_deduction: number };

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const { data: payrollRules } = useQuery({ queryKey: ["payroll-rules"], queryFn: () => api<PayrollRule[]>("/settings/payroll-rules") });
  const { data: doctorRules } = useQuery({ queryKey: ["doctor-fee-rules"], queryFn: () => api<DoctorFeeRule[]>("/settings/doctor-fee-rules") });
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

  return (
    <>
      <PageHeader title="Settings" eyebrow="Configurable calculation rules" />
      <LayerCard className="flex items-center justify-between gap-4 border-kumo-danger p-4">
        <div>
          <Text as="h2" variant="heading3">Testing Tools</Text>
          <Text variant="secondary" size="sm">Refresh database menghapus semua data app, lalu membuat ulang admin dan default rules.</Text>
          {refreshMessage ? <Text variant="error" size="sm">{refreshMessage}</Text> : null}
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
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">Payroll Rules</Text>
        <DataTable
          rows={payrollRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            { key: "default", header: "Default", render: (row) => <Badge variant={row.is_default ? "success" : "secondary"}>{row.is_default ? "yes" : "no"}</Badge> },
            { key: "bpjs", header: "BPJS", align: "right", render: (row) => `${(row.bpjs_jht_rate * 100).toFixed(1)}%` },
            { key: "overtime", header: "Lembur / menit", align: "right", render: (row) => row.overtime_rate_per_minute },
            { key: "pph", header: "PPh 21", align: "right", render: (row) => `${(row.pph21_rate * 100).toFixed(1)}%` },
          ]}
        />
      </LayerCard>
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">Doctor Fee Rules</Text>
        <DataTable
          rows={doctorRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            { key: "default", header: "Default", render: (row) => <Badge variant={row.is_default ? "success" : "secondary"}>{row.is_default ? "yes" : "no"}</Badge> },
            { key: "normal", header: "Normal", align: "right", render: (row) => `${(row.normal_fee_rate * 100).toFixed(0)}%` },
            { key: "ortho", header: "Ortho", align: "right", render: (row) => `${(row.ortho_fee_rate * 100).toFixed(0)}%` },
            { key: "tax", header: "Pajak", align: "right", render: (row) => `${(row.tax_rate * 100).toFixed(1)}%` },
          ]}
        />
      </LayerCard>
    </>
  );
}
