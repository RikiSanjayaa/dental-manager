import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { LinkButton } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, FileUp } from "lucide-react";
import { ChangeEvent, useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";

type Attendance = {
  id: number;
  employee_name_snapshot: string;
  work_date: string;
  timezone1_in?: string;
  timezone1_out?: string;
  timezone2_in?: string;
  timezone2_out?: string;
  late_minutes: number;
  early_leave_minutes: number;
  absent_minutes: number;
  overtime_minutes: number;
  needs_review: boolean;
};

export function AttendancePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["attendance", period], queryFn: () => api<Attendance[]>(`/attendance-records?period=${period}`) });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api<{ created: number; invalid_rows: number }>("/attendance/import", { method: "POST", body: form });
    },
    onSuccess: async (result) => {
      setMessage(`Import absensi: ${result.created} baris dibuat, ${result.invalid_rows} invalid.`);
      await queryClient.invalidateQueries({ queryKey: ["attendance", period] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Import absensi gagal."),
  });

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) upload.mutate(file);
    event.target.value = "";
  }

  return (
    <>
      <PageHeader
        title="Absensi"
        eyebrow="Fingerprint auto + HR review"
        actions={
          <>
            <Input className="w-40" aria-label="Periode absensi" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            <LinkButton variant="secondary" href="/api/reports/templates/attendance.xlsx" download="attendance-template.xlsx" icon={<FileDown size={18} />}>
              Format Absensi
            </LinkButton>
            <label className="relative inline-flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-kumo-base px-3 text-kumo-default ring ring-kumo-hairline hover:bg-kumo-tint">
              <FileUp size={18} />
              Import Absensi
              <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept=".xlsx,.xls" onChange={onImport} />
            </label>
          </>
        }
      />
      {message ? <Banner variant="default" description={message} /> : null}
      <Banner variant="secondary" description="Gunakan format absensi untuk import manual, atau upload file fingerprint lama jika masih diperlukan." />
      <LayerCard className="p-4">
        <DataTable
          rows={data ?? []}
          columns={[
            { key: "date", header: "Tanggal", render: (row) => row.work_date },
            { key: "name", header: "Nama", render: (row) => row.employee_name_snapshot },
            { key: "shift1", header: "Shift I", render: (row) => `${row.timezone1_in ?? "-"} / ${row.timezone1_out ?? "-"}` },
            { key: "shift2", header: "Shift II", render: (row) => `${row.timezone2_in ?? "-"} / ${row.timezone2_out ?? "-"}` },
            { key: "late", header: "Telat", align: "right", render: (row) => row.late_minutes },
            { key: "absent", header: "Absen", align: "right", render: (row) => row.absent_minutes },
            { key: "review", header: "Review", render: (row) => row.needs_review ? <Badge variant="error">review</Badge> : <Badge variant="success">ok</Badge> },
          ]}
        />
      </LayerCard>
    </>
  );
}
