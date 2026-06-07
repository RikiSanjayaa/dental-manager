import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Table } from "@cloudflare/kumo/components/table";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
} from "lucide-react";

import { rupiah } from "../../lib/api";
import { MASTER_META } from "./constants";
import type { ImportSession, PreviewRow, PreviewStatus } from "./types";
import { previewDetail, previewIdentity } from "./utils";

// ── Local helpers (only used in this file) ───────────────────────────────────

function statusBadge(status: PreviewStatus) {
  if (status === "new") return <Badge variant="success">baru</Badge>;
  if (status === "update") return <Badge variant="secondary">update</Badge>;
  return <Badge variant="error">invalid</Badge>;
}

function summaryMetric(
  label: string,
  value: number,
  tone: "default" | "success" | "warning" | "danger" = "default",
) {
  const toneClass = {
    default: "border-kumo-hairline bg-kumo-base",
    success: "border-kumo-hairline bg-kumo-success/5",
    warning: "border-kumo-hairline bg-kumo-warning/5",
    danger: "border-kumo-hairline bg-kumo-danger/5",
  }[tone];
  return (
    <div className={`rounded border p-2 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-normal text-kumo-subtle">
        {label}
      </div>
      <div className="text-lg font-semibold text-kumo-default">{value}</div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

type Props = {
  session: ImportSession;
  isPreviewPending: boolean;
  isCommitting: boolean;
  hasCommitReady: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: () => void;
};

export function ImportPreviewDialog({
  session,
  isPreviewPending,
  isCommitting,
  hasCommitReady,
  onOpenChange,
  onCommit,
}: Props) {
  const preview = session.preview;

  return (
    <Dialog.Root
      open={session.open}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <Dialog size="xl" className="p-8">
        {/* Header */}
        <div
          className="flex items-center gap-3"
          style={{ marginBottom: "16px" }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-info/20">
            <FileUp size={20} className="text-kumo-info" />
          </div>
          <div>
            <Dialog.Title className="text-xl font-semibold">
              Preview Import {MASTER_META[session.target].label}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-kumo-subtle">
              {session.filename ?? "File Excel"} akan dicek sebelum mengubah
              master data.
            </Dialog.Description>
          </div>
        </div>

        {/* Loading / error state */}
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {isPreviewPending ? (
            <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-kumo-subtle">
              <Loader />
              <span>Membaca workbook dan memvalidasi baris...</span>
            </div>
          ) : null}

          {session.error && !isPreviewPending ? (
            <Banner
              variant="error"
              icon={<AlertTriangle size={20} />}
              description={session.error}
            />
          ) : null}
        </div>

        {/* Preview results */}
        {preview && !isPreviewPending ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {session.committed ? (
              <Banner
                variant="default"
                icon={<CheckCircle2 size={20} />}
                description={`Import selesai: ${session.committed.created} dibuat, ${session.committed.updated} diperbarui.`}
              />
            ) : null}

            {/* Summary metrics */}
            <div className="flex gap-2">
              <div className="flex-1">
                {summaryMetric("Valid", preview.valid_rows, "success")}
              </div>
              <div className="flex-1">
                {summaryMetric(
                  "Invalid",
                  preview.invalid_rows,
                  preview.invalid_rows ? "danger" : "default",
                )}
              </div>
              <div className="flex-1">
                {summaryMetric("Baru", preview.summary.new ?? 0, "success")}
              </div>
              <div className="flex-1">
                {summaryMetric("Update", preview.summary.update ?? 0, "warning")}
              </div>
              <div className="flex-1">
                {summaryMetric(
                  "Duplikat",
                  preview.summary.duplicate_in_file ?? 0,
                  preview.summary.duplicate_in_file ? "danger" : "default",
                )}
              </div>
            </div>

            {/* Preview table */}
            <div
              style={{ maxHeight: "40vh", overflowY: "auto" }}
              className="rounded-lg border border-kumo-hairline bg-kumo-base"
            >
              <Table className="w-full min-w-[720px]">
                <Table.Header sticky>
                  <Table.Row>
                    <Table.Head>Row</Table.Head>
                    <Table.Head>Data</Table.Head>
                    <Table.Head>Nilai Utama</Table.Head>
                    <Table.Head>Status</Table.Head>
                    <Table.Head>Catatan</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {preview.rows.length ? (
                    preview.rows.slice(0, 80).map((row: PreviewRow, index: number) => (
                      <Table.Row
                        key={`${row.row ?? index}-${row.name ?? index}`}
                      >
                        <Table.Cell>{row.row ?? "-"}</Table.Cell>
                        <Table.Cell>
                          {previewIdentity(session.target, row)}
                        </Table.Cell>
                        <Table.Cell>
                          {previewDetail(session.target, row, rupiah)}
                        </Table.Cell>
                        <Table.Cell>{statusBadge(row.status)}</Table.Cell>
                        <Table.Cell>
                          {row.issues?.length ? row.issues.join(", ") : "-"}
                        </Table.Cell>
                      </Table.Row>
                    ))
                  ) : (
                    <Table.Row>
                      <Table.Cell colSpan={5}>
                        <Empty
                          size="sm"
                          icon={<FileSpreadsheet size={36} />}
                          title="Tidak ada baris valid"
                          description="Periksa template dan isi kolom wajib sebelum import ulang."
                        />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </div>

            {/* Validation errors */}
            {preview.errors.length ? (
              <div className="rounded-lg border border-kumo-hairline bg-kumo-danger/5 p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-kumo-default">
                  <AlertTriangle size={18} />
                  Error validasi
                </div>
                <div className="space-y-2 text-sm text-kumo-subtle">
                  {preview.errors.slice(0, 12).map((error, index) => (
                    <div
                      key={`${error.row ?? index}-${error.message}`}
                      className="rounded-md bg-kumo-base p-2"
                    >
                      Row {error.row ?? "-"}{" "}
                      {error.field ? `(${error.field})` : ""}: {error.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close
            render={(props) => (
              <Button variant="secondary" {...props}>
                Tutup
              </Button>
            )}
          />
          <Button
            variant="primary"
            loading={isCommitting}
            disabled={!hasCommitReady || isCommitting}
            onClick={onCommit}
          >
            Commit Import
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
