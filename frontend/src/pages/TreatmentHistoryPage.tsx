import { Badge } from "@cloudflare/kumo/components/badge";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, FileUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { DataTable } from "../components/DataTable";
import { TransactionEditorDialog } from "../components/treatment-history/TransactionEditorDialog";
import { TransactionImportPreviewDialog } from "../components/treatment-history/TransactionImportPreviewDialog";
import { TreatmentHistoryToolbar } from "../components/treatment-history/TreatmentHistoryToolbar";
import type {
  Doctor,
  EditorSession,
  ImportPreview,
  ImportSession,
  Treatment,
  TreatmentTransaction,
} from "../components/treatment-history/types";
import {
  emptyTransactionValues,
  includesText,
  payloadFromEditor,
  valuesFromTransaction,
} from "../components/treatment-history/utils";
import { api, rupiah } from "../lib/api";

export function TreatmentHistoryPage() {
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState(searchParams.get("period") ?? new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const [doctorFilter, setDoctorFilter] = useState(searchParams.get("doctor_id") ?? "all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; ids: number[]; title: string; description: string }>({
    open: false,
    ids: [],
    title: "",
    description: "",
  });
  const [editor, setEditor] = useState<EditorSession>({
    open: false,
    mode: "create",
    values: emptyTransactionValues(period),
  });
  const [importSession, setImportSession] = useState<ImportSession>({ open: false });
  const addAnotherAfterSaveRef = useRef(false);

  const { data: transactions } = useQuery({
    queryKey: ["treatment-history", period],
    queryFn: () => api<TreatmentTransaction[]>(`/doctor-transactions?period=${period}`),
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => api<Doctor[]>("/doctors"),
  });
  const { data: treatments } = useQuery({
    queryKey: ["treatments"],
    queryFn: () => api<Treatment[]>("/treatments"),
  });

  const activeDoctors = useMemo(() => (doctors ?? []).filter((doctor) => doctor.is_active), [doctors]);
  const activeTreatments = useMemo(() => (treatments ?? []).filter((treatment) => treatment.is_active), [treatments]);

  const filteredTransactions = useMemo(() => {
    return (transactions ?? []).filter((row) => {
      const matchesSearch =
        !search ||
        [row.patient_name, row.doctor_name, row.treatment_name, row.treatment_name_snapshot].some((value) =>
          includesText(value, search),
        );
      const matchesDoctor = doctorFilter === "all" || String(row.doctor_id) === doctorFilter;
      const matchesReview =
        reviewFilter === "all" ||
        (reviewFilter === "review" ? row.needs_review : !row.needs_review);
      const matchesDate = !dateFilter || row.transaction_date === dateFilter;
      return matchesSearch && matchesDoctor && matchesReview && matchesDate;
    });
  }, [dateFilter, doctorFilter, reviewFilter, search, transactions]);

  const saveTransaction = useMutation({
    mutationFn: async (session: EditorSession) => {
      const payload = payloadFromEditor(session);
      const path = session.mode === "edit" ? `/doctor-transactions/${session.id}` : "/doctor-transactions";
      return api<TreatmentTransaction>(path, {
        method: session.mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (_, session) => {
      toasts.add({
        title: session.mode === "edit" ? "Riwayat perawatan diperbarui" : "Riwayat perawatan ditambahkan",
        variant: "success",
      });
      if (session.mode === "create" && addAnotherAfterSaveRef.current) {
        setEditor((current) => ({
          ...current,
          open: true,
          mode: "create",
          values: {
            ...current.values,
            treatment_id: "",
            treatment_name_snapshot: "",
            qty: "1",
            discount_amount: "0",
            bhp_override: "",
            price_override: "",
            special_fee_amount: "0",
            fee_rate: "",
            needs_review: "false",
            review_note: "",
          },
        }));
      } else {
        setEditor((current) => ({ ...current, open: false }));
      }
      addAnotherAfterSaveRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ["treatment-history", period] });
    },
    onError: (error) =>
      toasts.add({
        title: "Riwayat perawatan gagal disimpan",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const deleteTransaction = useMutation({
    mutationFn: (id: number) => api(`/doctor-transactions/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toasts.add({ title: "Riwayat perawatan dihapus", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["treatment-history", period] });
    },
    onError: (error) =>
      toasts.add({
        title: "Riwayat perawatan gagal dihapus",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const deleteSelectedTransactions = useMutation({
    mutationFn: async (ids: number[]) =>
      Promise.all(ids.map((id) => api(`/doctor-transactions/${id}`, { method: "DELETE" }))),
    onSuccess: async (_, ids) => {
      toasts.add({
        title: `${ids.length} riwayat perawatan dihapus`,
        variant: "success",
      });
      setSelectedTransactionIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["treatment-history", period] });
    },
    onError: (error) =>
      toasts.add({
        title: "Riwayat perawatan gagal dihapus",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const previewImport = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api<ImportPreview>("/doctor-transactions/import/preview", {
        method: "POST",
        body: form,
      });
    },
    onMutate: (file) => setImportSession({ open: true, filename: file.name }),
    onSuccess: (preview, file) => setImportSession({ open: true, filename: file.name, preview }),
    onError: (error, file) =>
      setImportSession({
        open: true,
        filename: file.name,
        error: error instanceof Error ? error.message : "Preview import gagal.",
      }),
  });

  const commitImport = useMutation({
    mutationFn: (importId: number) =>
      api<{ created: number; updated: number; invalid_rows: number }>(`/doctor-transactions/import/${importId}/commit`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      toasts.add({
        title: "Import riwayat perawatan selesai",
        description: `${result.created} transaksi dibuat, ${result.invalid_rows} invalid.`,
        variant: "success",
      });
      setImportSession((current) => ({ ...current, committed: result }));
      await queryClient.invalidateQueries({ queryKey: ["treatment-history", period] });
    },
    onError: (error) =>
      setImportSession((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Commit import gagal.",
      })),
  });

  function openCreate() {
    setEditor({ open: true, mode: "create", values: emptyTransactionValues(period) });
    addAnotherAfterSaveRef.current = false;
  }

  function openEdit(row: TreatmentTransaction) {
    setEditor({ open: true, mode: "edit", id: row.id, values: valuesFromTransaction(row) });
    addAnotherAfterSaveRef.current = false;
  }

  function updateEditorValue(field: string, value: string) {
    setEditor((current) => ({
      ...current,
      values: { ...current.values, [field]: value },
    }));
  }

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) previewImport.mutate(file);
    event.target.value = "";
  }

  function clearFilters() {
    setSearch("");
    setDoctorFilter("all");
    setReviewFilter("all");
    setDateFilter("");
  }

  function toggleSelected(row: TreatmentTransaction, selected: boolean) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (selected) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
  }

  function togglePageSelected(rows: TreatmentTransaction[], selected: boolean) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => {
        if (selected) next.add(row.id);
        else next.delete(row.id);
      });
      return next;
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Riwayat Perawatan</h1>
          <p className="mt-1 text-sm text-gray-600">
            Transaksi tindakan pasien sebagai dasar fee dokter bulanan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton
            variant="secondary"
            href="/api/reports/templates/doctor-transactions.xlsx"
            download="doctor-transactions-template.xlsx"
            icon={<FileDown size={18} />}
          >
            Format Import
          </LinkButton>
          <Button variant="secondary" icon={<Plus size={18} />} onClick={openCreate}>
            Tambah Transaksi
          </Button>
          <label className="relative inline-flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-kumo-brand px-3 text-white hover:bg-kumo-brand-hover">
            <FileUp size={18} />
            Import
            <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept=".xlsx,.xls" onChange={onImport} />
          </label>
        </div>
      </div>

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Text as="h2" variant="heading3">Data Transaksi</Text>
              <p className="mt-1 text-sm text-kumo-subtle">
                {filteredTransactions.length} transaksi ditampilkan untuk periode {period}.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
              Periode
              <Input
                className="w-40"
                aria-label="Periode riwayat perawatan"
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              />
            </label>
          </div>
          <TreatmentHistoryToolbar
            search={search}
            doctorFilter={doctorFilter}
            reviewFilter={reviewFilter}
            dateFilter={dateFilter}
            doctors={activeDoctors}
            onSearchChange={setSearch}
            onDoctorFilterChange={setDoctorFilter}
            onReviewFilterChange={setReviewFilter}
            onDateFilterChange={setDateFilter}
            onClear={clearFilters}
          />
          {selectedTransactionIds.size ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-hairline bg-kumo-base px-3 py-2">
              <span className="text-sm font-medium text-kumo-default">
                {selectedTransactionIds.size} transaksi dipilih
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary-destructive"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  loading={deleteSelectedTransactions.isPending}
                  onClick={() => {
                    const ids = Array.from(selectedTransactionIds);
                    setDeleteConfirm({
                      open: true,
                      ids,
                      title: "Hapus transaksi terpilih?",
                      description: `${ids.length} transaksi akan dihapus permanen dari periode ini.`,
                    });
                  }}
                >
                  Hapus
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTransactionIds(new Set())}>
                  Batal pilih
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DataTable
          rows={filteredTransactions}
          pagination
          pageSize={25}
          minTableWidth={2100}
          rowKey={(row) => row.id}
          selectable
          selectedKeys={selectedTransactionIds}
          onToggleRow={(row, selected) => toggleSelected(row, selected)}
          onTogglePage={(rows, selected) => togglePageSelected(rows, selected)}
          columns={[
            { key: "date", header: "Tanggal", render: (row) => row.transaction_date },
            { key: "patient", header: "Nama Pasien", render: (row) => row.patient_name },
            { key: "doctor", header: "Dokter", render: (row) => row.doctor_name },
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
              render: (row) => row.needs_review ? <Badge variant="error">review</Badge> : <Badge variant="success">ok</Badge>,
            },
            {
              key: "actions",
              header: "",
              align: "right",
              sticky: "right",
              render: (row) => (
                <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenu.Trigger
                      render={
                        <Button variant="ghost" size="sm" shape="square" aria-label="Aksi transaksi">
                          <MoreHorizontal size={16} />
                        </Button>
                      }
                    />
                    <DropdownMenu.Content>
                      <DropdownMenu.Item icon={<Pencil className="mr-2" size={16} />} onClick={() => openEdit(row)}>
                        Edit
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        icon={<Trash2 className="mr-2" size={16} />}
                        variant="danger"
                        disabled={deleteTransaction.isPending}
                        onClick={() => {
                          setDeleteConfirm({
                            open: true,
                            ids: [row.id],
                            title: "Hapus transaksi?",
                            description: `Transaksi ${row.patient_name} pada ${row.transaction_date} akan dihapus permanen.`,
                          });
                        }}
                      >
                        Hapus
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </div>
              ),
            },
          ]}
        />
      </LayerCard>

      <TransactionEditorDialog
        editor={editor}
        doctors={activeDoctors}
        treatments={activeTreatments}
        isSaving={saveTransaction.isPending}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onFieldChange={updateEditorValue}
        onSubmit={() => saveTransaction.mutate(editor)}
        onSubmitAndAddAnother={() => {
          addAnotherAfterSaveRef.current = true;
          saveTransaction.mutate(editor);
        }}
      />

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        isDeleting={deleteTransaction.isPending || deleteSelectedTransactions.isPending}
        onOpenChange={(open) => setDeleteConfirm((current) => ({ ...current, open }))}
        onConfirm={() => {
          if (deleteConfirm.ids.length === 1) deleteTransaction.mutate(deleteConfirm.ids[0]);
          else deleteSelectedTransactions.mutate(deleteConfirm.ids);
          setDeleteConfirm((current) => ({ ...current, open: false }));
        }}
      />

      <TransactionImportPreviewDialog
        session={importSession}
        isPreviewPending={previewImport.isPending}
        isCommitting={commitImport.isPending}
        hasCommitReady={Boolean(importSession.preview && importSession.preview.valid_rows > 0 && !importSession.committed)}
        onOpenChange={(open) => setImportSession((current) => ({ ...current, open }))}
        onCommit={() => importSession.preview && commitImport.mutate(importSession.preview.import_id)}
      />
    </>
  );
}
