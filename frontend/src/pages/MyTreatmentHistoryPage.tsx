import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable } from "../components/DataTable";
import type { TreatmentTransaction } from "../components/treatment-history/types";
import { api, rupiah } from "../lib/api";

export function MyTreatmentHistoryPage() {
  // Kosongkan kolom periode untuk melihat seluruh riwayat (semua periode).
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const { data: transactions, isError, error } = useQuery({
    queryKey: ["my-treatment-history", period],
    queryFn: () =>
      api<TreatmentTransaction[]>(
        period ? `/me/doctor-transactions?period=${period}` : "/me/doctor-transactions",
      ),
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Riwayat Perawatan Saya</h1>
          <p className="mt-1 text-sm text-gray-600">Data perawatan yang tercatat atas nama Anda, hanya untuk dilihat.</p>
        </div>
      </div>

      {isError ? (
        <LayerCard className="p-4">
          <p className="text-sm text-kumo-danger">
            {error instanceof Error ? error.message : "Riwayat perawatan belum bisa dimuat."}
          </p>
        </LayerCard>
      ) : null}

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Text as="h2" variant="heading3">Data Transaksi</Text>
            <p className="mt-1 text-sm text-kumo-subtle">
              {transactions?.length ?? 0} transaksi{period ? ` untuk periode ${period}` : " (semua periode)"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
              Periode
              <Input
                className="w-40"
                aria-label="Periode riwayat perawatan saya"
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              />
            </label>
            {period ? (
              <Button variant="ghost" size="sm" onClick={() => setPeriod("")}>
                Semua periode
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          rows={transactions ?? []}
          pagination
          pageSize={25}
          minTableWidth={1750}
          rowKey={(row) => row.id}
          empty="Belum ada transaksi perawatan pada periode ini."
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
  );
}
