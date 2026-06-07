import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, FileDown, FileUp, Lock, Sheet } from "lucide-react";
import { ChangeEvent, useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { api, downloadFile, rupiah } from "../lib/api";

type Summary = {
  id: number;
  doctor_id: number;
  treatment_fee_total: number;
  ortho_fee_total: number;
  total_fee: number;
  total_bill: number;
  tax: number;
  transfer_amount: number;
  status: string;
};
type Transaction = {
  id: number;
  transaction_date: string;
  patient_name: string;
  treatment_name_snapshot: string;
  qty: number;
  discount_amount: number;
  doctor_fee_amount: number;
  total_bill_amount: number;
  needs_review: boolean;
};

export function DoctorFeesPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: summaries } = useQuery({ queryKey: ["doctor-summary", period], queryFn: () => api<Summary[]>(`/doctor-periods/${period}/summary`) });
  const { data: transactions } = useQuery({ queryKey: ["doctor-transactions", period], queryFn: () => api<Transaction[]>(`/doctor-transactions?period=${period}`) });
  const calculate = useMutation({
    mutationFn: () => api(`/doctor-periods/${period}/calculate`, { method: "POST" }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["doctor-summary", period] }),
  });
  const lock = useMutation({
    mutationFn: () => api(`/doctor-periods/${period}/lock`, { method: "POST" }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["doctor-summary", period] }),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api<{ created: number; invalid_rows: number }>("/doctor-transactions/import", { method: "POST", body: form });
    },
    onSuccess: async (result) => {
      setMessage(`Import transaksi dokter: ${result.created} baris dibuat, ${result.invalid_rows} invalid.`);
      await queryClient.invalidateQueries({ queryKey: ["doctor-transactions", period] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Import transaksi dokter gagal."),
  });

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) upload.mutate(file);
    event.target.value = "";
  }

  return (
    <>
      <PageHeader
        title="Fee Dokter"
        eyebrow="Tindakan, jasa, pajak, transfer"
        actions={
          <>
            <Input className="w-40" aria-label="Periode fee dokter" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            <LinkButton variant="secondary" href="/api/reports/templates/doctor-transactions.xlsx" download="doctor-transactions-template.xlsx" icon={<FileDown size={18} />}>
              Format Transaksi
            </LinkButton>
            <label className="relative inline-flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-kumo-base px-3 text-kumo-default ring ring-kumo-hairline hover:bg-kumo-tint">
              <FileUp size={18} />
              Import Transaksi
              <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept=".xlsx,.xls" onChange={onImport} />
            </label>
            <Button variant="secondary" icon={<Calculator size={18} />} loading={calculate.isPending} onClick={() => calculate.mutate()}>Calculate</Button>
            <Button variant="secondary" icon={<Lock size={18} />} loading={lock.isPending} onClick={() => lock.mutate()}>Lock</Button>
          </>
        }
      />
      {message ? <Banner variant="default" description={message} /> : null}
      <Banner variant="secondary" description="Import di halaman ini hanya untuk transaksi tindakan dokter. Master dokter dan treatment diatur dari Master Data." />
      <LayerCard className="p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Text as="h2" variant="heading3">Rekap Transfer</Text>
          <Button variant="secondary" icon={<Sheet size={18} />} onClick={() => downloadFile(`/reports/doctor-fees?period=${period}&format=xlsx`, `doctor-fees-${period}.xlsx`)}>XLSX</Button>
        </div>
        <DataTable
          rows={summaries ?? []}
          columns={[
            { key: "doctor", header: "Dokter ID", render: (row) => row.doctor_id },
            { key: "treatment", header: "Fee Perawatan", align: "right", render: (row) => rupiah.format(row.treatment_fee_total) },
            { key: "total", header: "Total Fee", align: "right", render: (row) => rupiah.format(row.total_fee) },
            { key: "bill", header: "Total Bill", align: "right", render: (row) => rupiah.format(row.total_bill) },
            { key: "tax", header: "Pajak", align: "right", render: (row) => rupiah.format(row.tax) },
            { key: "transfer", header: "Transfer", align: "right", render: (row) => rupiah.format(row.transfer_amount) },
            { key: "status", header: "Status", render: (row) => <Badge variant="success" appearance="dot">{row.status}</Badge> },
          ]}
        />
      </LayerCard>
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">Transaksi Tindakan</Text>
        <DataTable
          rows={transactions ?? []}
          columns={[
            { key: "date", header: "Tanggal", render: (row) => row.transaction_date },
            { key: "patient", header: "Pasien", render: (row) => row.patient_name },
            { key: "treatment", header: "Perawatan", render: (row) => row.treatment_name_snapshot },
            { key: "qty", header: "Qty", align: "right", render: (row) => row.qty },
            { key: "fee", header: "Fee Dokter", align: "right", render: (row) => rupiah.format(row.doctor_fee_amount) },
            { key: "bill", header: "Bill", align: "right", render: (row) => rupiah.format(row.total_bill_amount) },
            { key: "review", header: "Review", render: (row) => row.needs_review ? <Badge variant="error">review</Badge> : <Badge variant="success">ok</Badge> },
          ]}
        />
      </LayerCard>
    </>
  );
}
