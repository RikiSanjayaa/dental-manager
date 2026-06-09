import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileUp, XCircle } from "lucide-react";

import type { ImportSession } from "./types";

type Props = {
  session: ImportSession;
  isPreviewPending: boolean;
  isCommitting: boolean;
  hasCommitReady: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: () => void;
};

function metric(label: string, value: number, tone: "default" | "success" | "warning" | "danger" = "default") {
  const toneClass = {
    default: "border-kumo-hairline bg-kumo-base",
    success: "border-kumo-hairline bg-kumo-success/5",
    warning: "border-kumo-hairline bg-kumo-warning/5",
    danger: "border-kumo-hairline bg-kumo-danger/5",
  }[tone];
  return (
    <div className={`rounded border p-2 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-normal text-kumo-subtle">{label}</div>
      <div className="text-lg font-semibold text-kumo-default">{value}</div>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "review") return <Badge variant="error">review</Badge>;
  if (status === "update") return <Badge variant="secondary">update</Badge>;
  if (status === "invalid") return <Badge variant="error">invalid</Badge>;
  return <Badge variant="success">baru</Badge>;
}

function attendanceStatus(row: { is_absent: boolean; is_holiday: boolean; is_sunday: boolean; overtime_minutes: number }) {
  const isDayOff = row.is_holiday || row.is_sunday;
  if (isDayOff && row.overtime_minutes > 0) return <span className="font-medium text-kumo-success">Lembur</span>;
  if (isDayOff) return <span className="font-medium text-kumo-subtle">Libur</span>;
  if (row.is_absent) return <XCircle size={16} className="text-kumo-danger" />;
  return <CheckCircle2 size={16} className="text-kumo-success" />;
}

export function AttendanceImportPreviewDialog({
  session,
  isPreviewPending,
  isCommitting,
  hasCommitReady,
  onOpenChange,
  onCommit,
}: Props) {
  const preview = session.preview;
  const importMessages = [
    ...(session.error ? [session.error] : []),
    ...(preview?.errors.map((error) =>
      [`Baris ${error.row ?? "-"}`, error.field, error.message].filter(Boolean).join(" - "),
    ) ?? []),
  ];

  return (
    <Dialog.Root open={session.open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="p-0" style={{ height: "95vh", maxHeight: "95vh", overflow: "hidden" }}>
        <div
          className="flex h-full min-h-0 flex-col"
          style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}
        >
          <div className="border-b border-kumo-hairline px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-info/20">
                <FileUp size={20} className="text-kumo-info" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-semibold">Preview Import Absensi</Dialog.Title>
                <Dialog.Description className="text-sm text-kumo-subtle">
                  {session.filename ?? "File Excel"} akan dicek sebelum mengubah data absensi.
                </Dialog.Description>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-4" style={{ minHeight: 0, flex: "1 1 0%", overflow: "auto" }}>
            {isPreviewPending ? (
              <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-kumo-subtle">
                <Loader />
                <span>Membaca workbook dan menghitung absensi...</span>
              </div>
            ) : null}

            {importMessages.length && !isPreviewPending ? <ImportErrorSummary messages={importMessages} /> : null}

            {preview && !isPreviewPending ? (
              <div style={{ display: "flex", flex: "1 1 0%", minHeight: 0, flexDirection: "column", gap: "16px" }}>
                {session.committed ? (
                  <Banner
                    variant="default"
                    icon={<CheckCircle2 size={20} />}
                    description={`Import selesai: ${session.committed.created} dibuat, ${session.committed.updated} diperbarui.`}
                  />
                ) : null}

                <div className="flex gap-2">
                  <div className="flex-1">
                    {metric("Valid", preview.valid_rows, "success")}
                  </div>
                  <div className="flex-1">
                    {metric("Review", preview.summary.review ?? 0, preview.summary.review ? "warning" : "default")}
                  </div>
                  <div className="flex-1">
                    {metric("Invalid", preview.invalid_rows, preview.invalid_rows ? "danger" : "default")}
                  </div>
                  <div className="flex-1">
                    {metric("Baru", preview.summary.new ?? 0, "default")}
                  </div>
                  <div className="flex-1">
                    {metric("Update", preview.summary.update ?? 0, "default")}
                  </div>
                  <div className="flex-1">
                    {metric(
                      "Duplikat",
                      preview.summary.duplicate_in_file ?? 0,
                      preview.summary.duplicate_in_file ? "danger" : "default",
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-kumo-hairline bg-kumo-base" style={{ flex: "1 1 0%", minHeight: 0, overflow: "auto" }}>
                  <Table className="w-full min-w-[980px]">
                    <Table.Header sticky>
                      <Table.Row>
                        <Table.Head>Row</Table.Head>
                        <Table.Head>Tanggal</Table.Head>
                        <Table.Head>ID</Table.Head>
                        <Table.Head>Nama</Table.Head>
                        <Table.Head>Timezone I</Table.Head>
                        <Table.Head>Timezone II</Table.Head>
                        <Table.Head>Absen</Table.Head>
                        <Table.Head>Total (Min)</Table.Head>
                        <Table.Head>Lembur (Min)</Table.Head>
                        <Table.Head>Status</Table.Head>
                        <Table.Head>Catatan</Table.Head>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {preview.rows.length ? (
                        preview.rows.slice(0, 80).map((row, index) => (
                          <Table.Row key={`${row.row ?? index}-${row.employee_name}-${row.work_date}`}>
                            <Table.Cell>{row.row ?? "-"}</Table.Cell>
                            <Table.Cell>{row.work_date}</Table.Cell>
                            <Table.Cell>{row.attendance_id ?? "-"}</Table.Cell>
                            <Table.Cell>{row.employee_name}</Table.Cell>
                            <Table.Cell>{row.timezone1_in ?? "-"} / {row.timezone1_out ?? "-"}</Table.Cell>
                            <Table.Cell>{row.timezone2_in ?? "-"} / {row.timezone2_out ?? "-"}</Table.Cell>
                            <Table.Cell>{attendanceStatus(row)}</Table.Cell>
                            <Table.Cell>{row.total_minutes} menit</Table.Cell>
                            <Table.Cell>{row.overtime_minutes} menit</Table.Cell>
                            <Table.Cell>{statusBadge(row.status)}</Table.Cell>
                            <Table.Cell>{row.issues?.length ? row.issues.join(", ") : "-"}</Table.Cell>
                          </Table.Row>
                        ))
                      ) : (
                        <Table.Row>
                          <Table.Cell colSpan={11}>
                            <Empty
                              size="sm"
                              icon={<FileSpreadsheet size={36} />}
                              title="Tidak ada absensi valid"
                              description="Periksa template dan isi kolom wajib sebelum import ulang."
                            />
                          </Table.Cell>
                        </Table.Row>
                      )}
                    </Table.Body>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
            <Dialog.Close render={(props) => <Button variant="secondary" {...props}>Tutup</Button>} />
            <Button variant="primary" loading={isCommitting} disabled={!hasCommitReady || isCommitting} onClick={onCommit}>
              Commit Import
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

function ImportErrorSummary({ messages }: { messages: string[] }) {
  return (
    <div className="rounded-lg border border-kumo-hairline bg-kumo-danger/5 p-4" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-kumo-default">
        <AlertTriangle size={18} className="text-kumo-danger" />
        Error validasi
        <Badge variant="error">{messages.length}</Badge>
      </div>
      <div className="rounded-md bg-kumo-base px-3 py-2 text-sm text-kumo-subtle ring ring-kumo-hairline" style={{ maxHeight: 144, overflow: "auto" }}>
        <ul className="space-y-1">
          {messages.map((message, index) => (
            <li key={`${index}-${message}`}>{message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
