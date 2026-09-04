import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "../components/DataTable";
import type { TreatmentTransaction } from "../components/treatment-history/types";
import { api, downloadFile, rupiah } from "../lib/api";

type FeeStatus = "empty" | "not_calculated" | "draft" | "locked";

type FeePeriods = {
  periods: Array<{ period: string; status: string }>;
  latest_period: string | null;
};

type FeeDoctor = {
  id: number;
  name: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
};

type FeeSummary = {
  status: FeeStatus;
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

type FeeDetail = {
  period: string;
  doctor: FeeDoctor | null;
  summary: FeeSummary;
  transactions: TreatmentTransaction[];
};

const statusLabel: Record<FeeStatus, string> = {
  empty: "Belum ada transaksi",
  not_calculated: "Belum dihitung",
  draft: "Draft sudah dihitung",
  locked: "Locked / final",
};

function statusBadge(status: FeeStatus | string) {
  const variant =
    status === "locked" ? "success" : status === "draft" ? "info" : "secondary";
  const label =
    status === "locked"
      ? "locked"
      : status === "draft"
        ? "draft"
        : status === "not_calculated"
          ? "belum dihitung"
          : "belum ada transaksi";
  return <Badge variant={variant}>{label}</Badge>;
}

export function MyDoctorFeesPage() {
  const toasts = useKumoToastManager();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { data: feePeriods, isError: periodsError, error: periodsErrorInfo } = useQuery({
    queryKey: ["my-doctor-fees"],
    queryFn: () => api<FeePeriods>("/me/doctor-fees"),
  });
  const period = selectedPeriod ?? feePeriods?.latest_period ?? "";
  const { data: detail, isError: detailError, error: detailErrorInfo } = useQuery({
    queryKey: ["my-doctor-fee-detail", period],
    queryFn: () => api<FeeDetail>(`/me/doctor-fees/${period}`),
    enabled: Boolean(period),
  });

  const summaryRows = useMemo(
    () => [
      ["Total fee dokter", detail?.summary.total_fee ?? 0],
      ["Tagihan pasien", detail?.summary.total_bill ?? 0],
      ["Potongan", -(detail?.summary.deduction ?? 0)],
      ["Pajak", -(detail?.summary.tax ?? 0)],
    ],
    [detail],
  );

  function changePeriod(value: string) {
    if (value) setSelectedPeriod(value);
  }

  async function download(format: "pdf" | "xlsx") {
    try {
      await downloadFile(
        `/me/doctor-fees/${period}/export?format=${format}`,
        format === "pdf" ? `fee-dokter-saya-${period}.pdf` : `fee-dokter-saya-${period}.xlsx`,
      );
      toasts.add({ title: "Rekap fee dokter diunduh", variant: "success" });
    } catch (downloadError) {
      toasts.add({
        title: "Download fee dokter gagal",
        description: downloadError instanceof Error ? downloadError.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Fee Dokter Saya</h1>
          <p className="mt-1 text-sm text-gray-600">{detail?.doctor?.name ?? "Rekap fee dokter pribadi"}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input
            className="w-40"
            aria-label="Periode fee dokter saya"
            type="month"
            value={period}
            onChange={(event) => changePeriod(event.target.value)}
          />
        </div>
      </div>

      {periodsError ? (
        <LayerCard className="p-4">
          <p className="text-sm text-kumo-danger">
            {periodsErrorInfo instanceof Error ? periodsErrorInfo.message : "Data fee dokter pribadi belum bisa dimuat."}
          </p>
        </LayerCard>
      ) : null}

      {feePeriods && feePeriods.periods.length === 0 ? (
        <LayerCard className="p-4">
          <p className="text-sm text-kumo-subtle">
            Belum ada transaksi fee dokter untuk akun ini. Periode akan muncul setelah staf mencatat perawatan atas nama Anda.
          </p>
        </LayerCard>
      ) : null}

      {detailError ? (
        <LayerCard className="p-4">
          <p className="text-sm text-kumo-danger">
            {detailErrorInfo instanceof Error ? detailErrorInfo.message : "Detail fee dokter belum bisa dimuat."}
          </p>
        </LayerCard>
      ) : null}

      {feePeriods && feePeriods.periods.length > 0 && period ? (
        <>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <LayerCard className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Text as="h2" variant="heading3">Rekap Periode {period}</Text>
                  <p className="mt-1 text-sm text-kumo-subtle">
                    {detail ? statusLabel[detail.summary.status] : "Memuat rekap periode..."}
                  </p>
                </div>
                {detail ? statusBadge(detail.summary.status) : null}
              </div>

              <div className="grid gap-3">
                <div className="rounded-md border border-kumo-line bg-kumo-base p-4">
                  <p className="text-xs text-kumo-subtle">Total transfer</p>
                  <p className="mt-2 font-semibold text-kumo-default">{rupiah.format(detail?.summary.transfer_amount ?? 0)}</p>
                </div>

                <div className="grid gap-2">
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
                  <p className="font-medium">{detail?.doctor?.bank_name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-kumo-subtle">Nama Penerima</p>
                  <p className="font-medium">{detail?.doctor?.account_name ?? detail?.doctor?.name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-kumo-subtle">No Rekening</p>
                  <p className="font-medium">{detail?.doctor?.account_number ?? "-"}</p>
                </div>
                <div>
                  <p className="text-kumo-subtle">Dihitung</p>
                  <p className="font-medium">{detail?.summary.calculated_at ? detail.summary.calculated_at.slice(0, 10) : "-"}</p>
                </div>
                <div>
                  <p className="text-kumo-subtle">Transaksi</p>
                  <p className="font-medium">
                    {detail?.summary.transaction_count ?? 0} transaksi, {detail?.summary.review_count ?? 0} review
                  </p>
                </div>
              </div>
              <div className="mt-auto grid gap-2">
                <Button
                  variant="secondary"
                  icon={<ReceiptText size={18} />}
                  disabled={!detail || detail.summary.status === "empty"}
                  onClick={() => download("pdf")}
                >
                  Download PDF
                </Button>
                <Button
                  variant="primary"
                  icon={<FileSpreadsheet size={18} />}
                  disabled={!detail || detail.summary.status === "empty"}
                  onClick={() => download("xlsx")}
                >
                  Download Excel
                </Button>
              </div>
            </LayerCard>
          </div>

          <LayerCard className="flex flex-col gap-4 p-4">
            <div>
              <Text as="h2" variant="heading3">Transaksi Saya</Text>
              <p className="mt-1 text-sm text-kumo-subtle">
                {detail?.transactions.length ?? 0} transaksi pada periode {period}.
              </p>
            </div>
            <DataTable
              rows={detail?.transactions ?? []}
              pagination
              pageSize={25}
              minTableWidth={1600}
              rowKey={(row) => row.id}
              empty="Tidak ada transaksi pada periode ini."
              columns={[
                { key: "date", header: "Tanggal", render: (row) => row.transaction_date },
                { key: "patient", header: "Nama Pasien", render: (row) => row.patient_name },
                { key: "treatment", header: "Perawatan", render: (row) => row.treatment_name_snapshot },
                { key: "bhp", header: "BHP", align: "right", render: (row) => rupiah.format(row.bhp_amount) },
                { key: "price", header: "Biaya Perawatan", align: "right", render: (row) => rupiah.format(row.price_amount) },
                { key: "qty", header: "Qty", align: "right", render: (row) => row.qty },
                { key: "discount", header: "Diskon", align: "right", render: (row) => rupiah.format(row.discount_amount) },
                { key: "service", header: "Biaya Jasa", align: "right", render: (row) => rupiah.format(row.service_amount) },
                { key: "fee", header: "Fee Dokter", align: "right", render: (row) => rupiah.format(row.doctor_fee_amount) },
                { key: "ortho", header: "Fee Khusus Behel", align: "right", render: (row) => rupiah.format(row.special_fee_amount) },
                { key: "bill", header: "Total Biaya", align: "right", render: (row) => <strong>{rupiah.format(row.total_bill_amount)}</strong> },
                {
                  key: "review",
                  header: "Status",
                  render: (row) => (row.needs_review ? <Badge variant="error">review</Badge> : <Badge variant="success">ok</Badge>),
                },
              ]}
            />
          </LayerCard>
        </>
      ) : null}
    </>
  );
}
