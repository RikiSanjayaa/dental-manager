import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileUp } from "lucide-react";

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
  if (status === "invalid") return <Badge variant="error">invalid</Badge>;
  return <Badge variant="success">valid</Badge>;
}

export function TransactionImportPreviewDialog({
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
      <Dialog
        size="xl"
        className="p-0"
        style={{ height: "95vh", maxHeight: "95vh", overflow: "hidden" }}
      >
        <div
          className="flex h-full min-h-0 flex-col"
          style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}
        >
          <div className="border-b border-kumo-hairline px-8 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-info/20">
                <FileUp size={20} className="text-kumo-info" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-semibold">Preview Import Riwayat Perawatan</Dialog.Title>
                <Dialog.Description className="text-sm text-kumo-subtle">
                  {session.filename ?? "File Excel"} akan dicek sebelum membuat transaksi.
                </Dialog.Description>
              </div>
            </div>
          </div>

          <div
            className="flex flex-col gap-4 px-6 py-4"
            style={{ minHeight: 0, flex: "1 1 0%", overflow: "auto" }}
          >
            {isPreviewPending ? (
              <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-kumo-subtle">
                <Loader />
                <span>Membaca workbook dan memvalidasi transaksi...</span>
              </div>
            ) : null}

            {importMessages.length && !isPreviewPending ? (
              <ImportErrorSummary messages={importMessages} />
            ) : null}

            {preview && !isPreviewPending ? (
              <div className="flex flex-col gap-4" style={{ flex: "1 1 0%", minHeight: 0 }}>
                {session.committed ? (
                  <Banner
                    variant="default"
                    icon={<CheckCircle2 size={20} />}
                    description={`Import selesai: ${session.committed.created} transaksi dibuat.`}
                  />
                ) : null}

                <div className="grid gap-2 md:grid-cols-4">
                  {metric("Valid", preview.valid_rows, "success")}
                  {metric("Review", preview.summary.review ?? 0, preview.summary.review ? "warning" : "default")}
                  {metric("Invalid", preview.invalid_rows, preview.invalid_rows ? "danger" : "default")}
                  {metric("Transaksi", preview.summary.transactions ?? preview.valid_rows, "default")}
                </div>

                <div className="rounded-lg border border-kumo-hairline bg-kumo-base" style={{ flex: "1 1 0%", minHeight: 0, overflow: "auto" }}>
                  <Table className="w-full min-w-[760px]">
                    <Table.Header sticky>
                      <Table.Row>
                        <Table.Head>Row</Table.Head>
                        <Table.Head>Tanggal</Table.Head>
                        <Table.Head>Dokter</Table.Head>
                        <Table.Head>Pasien</Table.Head>
                        <Table.Head>Perawatan</Table.Head>
                        <Table.Head>Status</Table.Head>
                        <Table.Head>Catatan</Table.Head>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {preview.rows.length ? (
                        preview.rows.slice(0, 80).map((row, index) => (
                          <Table.Row key={`${row.row ?? index}-${row.treatment_name ?? index}`}>
                            <Table.Cell>{row.row ?? "-"}</Table.Cell>
                            <Table.Cell>{row.transaction_date ?? "-"}</Table.Cell>
                            <Table.Cell>{row.doctor_name ?? "-"}</Table.Cell>
                            <Table.Cell>{row.patient_name ?? "-"}</Table.Cell>
                            <Table.Cell>{row.treatment_name ?? "-"}</Table.Cell>
                            <Table.Cell>{statusBadge(row.status)}</Table.Cell>
                            <Table.Cell>{row.issues?.length ? row.issues.join(", ") : "-"}</Table.Cell>
                          </Table.Row>
                        ))
                      ) : (
                        <Table.Row>
                          <Table.Cell colSpan={7}>
                            <Empty
                              size="sm"
                              icon={<FileSpreadsheet size={36} />}
                              title="Tidak ada transaksi valid"
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
    <div
      className="rounded-lg border border-kumo-hairline bg-kumo-danger/5 p-4"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-kumo-default">
        <AlertTriangle size={18} className="text-kumo-danger" />
        Error validasi
        <Badge variant="error">{messages.length}</Badge>
      </div>
      <div
        className="rounded-md bg-kumo-base px-3 py-2 text-sm text-kumo-subtle ring ring-kumo-hairline"
        style={{ maxHeight: 144, overflow: "auto" }}
      >
        <ul className="space-y-1">
          {messages.map((message, index) => (
            <li key={`${index}-${message}`}>{message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
