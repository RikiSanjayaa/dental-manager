import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "../components/DataTable";
import { api, downloadFile, rupiah } from "../lib/api";

type OvertimeRow = {
  id: number;
  work_date: string;
  timezone1_in?: string | null;
  timezone1_out?: string | null;
  timezone2_in?: string | null;
  timezone2_out?: string | null;
  overtime_minutes: number;
  status_note?: string | null;
  protest_note?: string | null;
};

type MyPayroll = {
  period: string;
  employee: {
    id: number;
    name: string;
    position?: string | null;
    bank_name?: string | null;
    account_name?: string | null;
    account_number?: string | null;
  };
  payroll?: {
    status: string;
    base_salary: number;
    gross_salary: number;
    overtime_total: number;
    bonus: number;
    position_allowance: number;
    total_deduction: number;
    net_salary: number;
    payment_method?: string | null;
    needs_review: boolean;
  } | null;
  attendance_count: number;
  attendance_review_count: number;
  overtime_minutes: number;
  overtime_rows: OvertimeRow[];
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function timeRange(start?: string | null, end?: string | null) {
  return `${start?.slice(0, 5) || "-"} / ${end?.slice(0, 5) || "-"}`;
}

export function MyPayrollPage() {
  const [params, setParams] = useSearchParams();
  const toasts = useKumoToastManager();
  const initialPeriod = params.get("period") || currentPeriod();
  const [period, setPeriod] = useState(initialPeriod);
  const { data, isError, error } = useQuery({
    queryKey: ["my-payroll", period],
    queryFn: () => api<MyPayroll>(`/me/payroll/${period}`),
  });

  const summaryRows = useMemo(
    () => [
      ["Gaji pokok", data?.payroll?.base_salary ?? 0],
      ["Lembur", data?.payroll?.overtime_total ?? 0],
      ["Bonus", data?.payroll?.bonus ?? 0],
      ["Tunjangan jabatan", data?.payroll?.position_allowance ?? 0],
      ["Potongan", -(data?.payroll?.total_deduction ?? 0)],
    ],
    [data],
  );

  function changePeriod(value: string) {
    setPeriod(value);
    setParams({ period: value });
  }

  async function download(format: "pdf" | "xlsx") {
    try {
      await downloadFile(`/me/payroll/${period}/export?format=${format}`, format === "pdf" ? `slip-gaji-${period}.pdf` : `payroll-saya-${period}.xlsx`);
      toasts.add({ title: "Payroll diunduh", variant: "success" });
    } catch (downloadError) {
      toasts.add({
        title: "Download payroll gagal",
        description: downloadError instanceof Error ? downloadError.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Payroll Saya</h1>
          <p className="mt-1 text-sm text-gray-600">{data?.employee.name ?? "Slip payroll pribadi operator"}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input className="w-40" aria-label="Periode payroll saya" type="month" value={period} onChange={(event) => changePeriod(event.target.value)} />
        </div>
      </div>

      {isError ? (
        <LayerCard className="p-4">
          <p className="text-sm text-kumo-danger">{error instanceof Error ? error.message : "Payroll pribadi belum bisa dimuat."}</p>
        </LayerCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <LayerCard className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Text as="h2" variant="heading3">Slip Periode {period}</Text>
              <p className="mt-1 text-sm text-kumo-subtle">
                {data?.employee.position ?? "Karyawan"} - {data?.payroll?.payment_method ?? "Transfer"}
              </p>
            </div>
            <Badge variant={data?.payroll?.needs_review ? "error" : data?.payroll?.status === "locked" ? "success" : "info"}>
              {data?.payroll?.needs_review ? "review" : data?.payroll?.status ?? "belum dihitung"}
            </Badge>
          </div>

          <div className="grid gap-3">
            <div className="payroll-total-card rounded-md border border-kumo-line bg-kumo-base p-4">
              <p className="text-xs text-kumo-subtle">Total transfer</p>
              <p className="payroll-total-amount mt-2 font-semibold text-kumo-default">{rupiah.format(data?.payroll?.net_salary ?? 0)}</p>
            </div>

            <div className="payroll-summary-grid grid gap-2">
              {summaryRows.map(([label, value]) => (
                <div key={String(label)} className="min-w-0 rounded-md border border-kumo-hairline bg-kumo-tint px-3 py-2">
                  <p className="text-xs text-kumo-subtle">{label}</p>
                  <p className="mt-1 truncate font-medium leading-tight">{rupiah.format(Number(value))}</p>
                </div>
              ))}
            </div>
          </div>
        </LayerCard>

        <LayerCard className="flex flex-col gap-4 p-4">
          <Text as="h2" variant="heading3">Informasi Pembayaran</Text>
          <div className="grid gap-3 text-sm">
            <div>
              <p className="text-kumo-subtle">Bank</p>
              <p className="font-medium">{data?.employee.bank_name ?? "-"}</p>
            </div>
            <div>
              <p className="text-kumo-subtle">Nama Penerima</p>
              <p className="font-medium">{data?.employee.account_name ?? data?.employee.name ?? "-"}</p>
            </div>
            <div>
              <p className="text-kumo-subtle">No Rekening</p>
              <p className="font-medium">{data?.employee.account_number ?? "-"}</p>
            </div>
            <div>
              <p className="text-kumo-subtle">Absensi</p>
              <p className="font-medium">{data?.attendance_count ?? 0} hari, {data?.attendance_review_count ?? 0} review</p>
            </div>
          </div>
          <div className="mt-auto grid gap-2">
            <Button variant="secondary" icon={<ReceiptText size={18} />} onClick={() => download("pdf")}>
              Download PDF
            </Button>
            <Button variant="primary" icon={<FileSpreadsheet size={18} />} onClick={() => download("xlsx")}>
              Download Excel
            </Button>
          </div>
        </LayerCard>
      </div>

      <LayerCard className="flex flex-col gap-4 p-4">
        <div>
          <Text as="h2" variant="heading3">Rincian Lembur</Text>
          <p className="mt-1 text-sm text-kumo-subtle">{data?.overtime_minutes ?? 0} menit lembur pada periode ini.</p>
        </div>
        <DataTable
          rows={data?.overtime_rows ?? []}
          minTableWidth={760}
          rowKey={(row) => row.id}
          empty="Tidak ada lembur pada periode ini."
          columns={[
            { key: "date", header: "Tanggal", render: (row) => row.work_date },
            { key: "tz1", header: "Timezone I", render: (row) => timeRange(row.timezone1_in, row.timezone1_out) },
            { key: "tz2", header: "Timezone II", render: (row) => timeRange(row.timezone2_in, row.timezone2_out) },
            { key: "minutes", header: "Menit", align: "right", render: (row) => `${row.overtime_minutes} min` },
            { key: "note", header: "Catatan", render: (row) => row.protest_note ?? row.status_note ?? "-" },
          ]}
        />
      </LayerCard>
    </>
  );
}
