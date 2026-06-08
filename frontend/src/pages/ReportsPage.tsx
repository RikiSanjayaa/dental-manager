import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Breadcrumbs } from "@cloudflare/kumo/components/breadcrumbs";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "../components/DataTable";
import { api, downloadFile } from "../lib/api";
import { brandName } from "../lib/brand";

type ReportArchive = {
  id: number;
  report_type: string;
  period: string;
  status: string;
  format: string;
  filename: string;
  media_type: string;
  file_size: number;
  created_by_name?: string | null;
  created_at: string;
  expires_at: string;
};

const reportTypeLabel: Record<string, string> = {
  doctor_fees: "Fee Dokter",
  payroll: "Payroll",
  payroll_slip: "Slip Gaji",
};

function statusBadge(status: string) {
  if (status === "final") return <Badge variant="success">final</Badge>;
  if (status === "draft") return <Badge variant="info">draft</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function formatBadge(format: string) {
  if (format === "xlsx") return <Badge variant="success">XLSX</Badge>;
  if (format === "pdf") return <Badge variant="error">PDF</Badge>;
  if (format === "zip") return <Badge variant="secondary">ZIP</Badge>;
  return <Badge variant="secondary">{format.toUpperCase()}</Badge>;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function daysUntil(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function includesText(value: unknown, query: string) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

export function ReportsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: archives } = useQuery({
    queryKey: ["report-archives"],
    queryFn: () => api<ReportArchive[]>("/reports/archive"),
  });

  const deleteArchive = useMutation({
    mutationFn: (id: number) => api(`/reports/archive/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["report-archives"] });
    },
  });

  const filteredArchives = useMemo(() => {
    return (archives ?? []).filter((row) => {
      const matchesSearch =
        !search ||
        [row.filename, row.period, reportTypeLabel[row.report_type], row.created_by_name].some((value) =>
          includesText(value, search),
        );
      const matchesType = typeFilter === "all" || row.report_type === typeFilter;
      const matchesFormat = formatFilter === "all" || row.format === formatFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesType && matchesFormat && matchesStatus;
    });
  }, [archives, formatFilter, search, statusFilter, typeFilter]);

  return (
    <>
      <div className="border-b border-kumo-line">
        <Breadcrumbs size="sm">
          <Breadcrumbs.Link href="/">{brandName}</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>Laporan</Breadcrumbs.Current>
        </Breadcrumbs>
      </div>

      <div className="flex items-start justify-between gap-4 py-3">
        <div>
          <h1 className="text-2xl font-semibold">Laporan</h1>
          <p className="mt-1 text-sm text-gray-600">
            Arsip file export dari Fee Dokter, Payroll, dan slip gaji
          </p>
        </div>
      </div>

      <Banner
        variant="secondary"
        description="File di halaman ini adalah snapshot hasil export, bukan generate ulang. Arsip disimpan 90 hari lalu otomatis dibersihkan."
      />

      <LayerCard className="mb-6 flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Text as="h2" variant="heading3">Arsip Export</Text>
            <p className="mt-1 text-sm text-kumo-subtle">
              Menampilkan {filteredArchives.length} dari {archives?.length ?? 0} file export aktif.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-72 flex-1 items-center gap-2">
            <Search size={16} className="text-kumo-subtle" />
            <Input
              aria-label="Cari arsip laporan"
              className="flex-1"
              placeholder="Cari nama file, periode, jenis laporan..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            className="w-44"
            aria-label="Filter jenis laporan"
            value={typeFilter}
            renderValue={(value) => (value === "doctor_fees" ? "Fee Dokter" : value === "payroll" ? "Payroll" : value === "payroll_slip" ? "Slip Gaji" : "Semua laporan")}
            onValueChange={(value) => setTypeFilter(String(value))}
          >
            <Select.Option value="all">Semua laporan</Select.Option>
            <Select.Option value="doctor_fees">Fee Dokter</Select.Option>
            <Select.Option value="payroll">Payroll</Select.Option>
            <Select.Option value="payroll_slip">Slip Gaji</Select.Option>
          </Select>
          <Select
            className="w-36"
            aria-label="Filter format"
            value={formatFilter}
            renderValue={(value) => (value === "xlsx" ? "XLSX" : value === "pdf" ? "PDF" : value === "zip" ? "ZIP" : "Semua format")}
            onValueChange={(value) => setFormatFilter(String(value))}
          >
            <Select.Option value="all">Semua format</Select.Option>
            <Select.Option value="xlsx">XLSX</Select.Option>
            <Select.Option value="pdf">PDF</Select.Option>
            <Select.Option value="zip">ZIP</Select.Option>
          </Select>
          <Select
            className="w-36"
            aria-label="Filter status"
            value={statusFilter}
            renderValue={(value) => (value === "final" ? "Final" : value === "draft" ? "Draft" : "Semua status")}
            onValueChange={(value) => setStatusFilter(String(value))}
          >
            <Select.Option value="all">Semua status</Select.Option>
            <Select.Option value="final">Final</Select.Option>
            <Select.Option value="draft">Draft</Select.Option>
          </Select>
        </div>

        <DataTable
          rows={filteredArchives}
          pagination
          pageSize={25}
          minTableWidth={1320}
          rowKey={(row) => row.id}
          empty="Belum ada file export tersimpan. File akan muncul setelah export dari halaman sumber."
          columns={[
            { key: "created", header: "Dibuat", render: (row) => formatDate(row.created_at) },
            { key: "type", header: "Jenis", render: (row) => reportTypeLabel[row.report_type] ?? row.report_type },
            { key: "period", header: "Periode", render: (row) => row.period },
            { key: "filename", header: "Nama File", render: (row) => row.filename },
            { key: "format", header: "Format", render: (row) => formatBadge(row.format) },
            { key: "status", header: "Status", render: (row) => statusBadge(row.status) },
            { key: "size", header: "Ukuran", align: "right", render: (row) => formatBytes(row.file_size) },
            { key: "by", header: "Dibuat Oleh", render: (row) => row.created_by_name ?? "-" },
            { key: "expires", header: "Expired", render: (row) => `${daysUntil(row.expires_at)} hari` },
            {
              key: "actions",
              header: "Aksi",
              sticky: "right",
              align: "right",
              render: (row) => (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<FileDown size={15} />}
                    onClick={() => downloadFile(`/reports/archive/${row.id}/download`, row.filename)}
                  >
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary-destructive"
                    shape="square"
                    aria-label={`Hapus ${row.filename}`}
                    icon={<Trash2 size={15} />}
                    loading={deleteArchive.isPending}
                    onClick={() => {
                      if (confirm(`Hapus arsip ${row.filename}?`)) deleteArchive.mutate(row.id);
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </LayerCard>
    </>
  );
}
