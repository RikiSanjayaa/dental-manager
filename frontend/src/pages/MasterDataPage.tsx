import { Banner } from "@cloudflare/kumo/components/banner";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileDown, FileSpreadsheet, FileUp, Plus } from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";

import { DoctorTable } from "../components/master-data/DoctorTable";
import { EmployeeTable } from "../components/master-data/EmployeeTable";
import { ImportPreviewDialog } from "../components/master-data/ImportPreviewDialog";
import { MasterTabBar } from "../components/master-data/MasterTabBar";
import { MasterToolbar } from "../components/master-data/MasterToolbar";
import { PermanentDeleteDialog } from "../components/master-data/PermanentDeleteDialog";
import { RecordEditorDialog } from "../components/master-data/RecordEditorDialog";
import { TreatmentTable } from "../components/master-data/TreatmentTable";
import { MASTER_META } from "../components/master-data/constants";
import type {
  CommitResult,
  Doctor,
  EditorSession,
  Employee,
  ImportPreview,
  ImportSession,
  MasterFilters,
  MasterTarget,
  PermanentDeleteSession,
  Treatment,
} from "../components/master-data/types";
import {
  editorPayload,
  editorValuesFromRow,
  emptyEditorValues,
  includesSearch,
  uniqueOptions,
} from "../components/master-data/utils";
import { api, downloadFile } from "../lib/api";

export function MasterDataPage() {
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const [isExporting, setIsExporting] = useState(false);

  // ── Tab / filter state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MasterTarget>("treatments");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MasterFilters>({
    status: "active",
    group: "all",
  });

  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<
    Record<MasterTarget, Set<number>>
  >({
    treatments: new Set(),
    doctors: new Set(),
    employees: new Set(),
  });

  // ── Dialog session state ─────────────────────────────────────────────────
  const [editor, setEditor] = useState<EditorSession>({
    open: false,
    target: "treatments",
    mode: "create",
    values: emptyEditorValues("treatments"),
  });
  const [permanentDelete, setPermanentDelete] = useState<PermanentDeleteSession>(
    { open: false, target: "treatments" },
  );
  const [importSession, setImportSession] = useState<ImportSession>({
    open: false,
    target: "treatments",
  });

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: treatments } = useQuery({
    queryKey: ["treatments"],
    queryFn: () => api<Treatment[]>("/treatments"),
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => api<Doctor[]>("/doctors"),
  });
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<Employee[]>("/employees"),
  });

  // ── Derived counts & filter options ─────────────────────────────────────
  const counts = {
    treatments: treatments?.length ?? 0,
    doctors: doctors?.length ?? 0,
    employees: employees?.length ?? 0,
  };

  const groupOptions = useMemo(() => {
    if (activeTab === "treatments")
      return uniqueOptions((treatments ?? []).map((r) => r.category));
    if (activeTab === "doctors")
      return uniqueOptions((doctors ?? []).map((r) => r.bank_name));
    return uniqueOptions((employees ?? []).map((r) => r.position));
  }, [activeTab, doctors, employees, treatments]);

  function passesSharedFilters(
    row: { is_active: boolean },
    groupValue?: string,
  ) {
    if (filters.status !== "all" && row.is_active !== (filters.status === "active"))
      return false;
    if (filters.group !== "all" && groupValue !== filters.group) return false;
    return true;
  }

  const filteredTreatments = useMemo(
    () =>
      (treatments ?? []).filter(
        (row) =>
          [row.code, row.name, row.category, row.notes].some((v) =>
            includesSearch(v, search),
          ) && passesSharedFilters(row, row.category),
      ),
    [filters, search, treatments],
  );

  const filteredDoctors = useMemo(
    () =>
      (doctors ?? []).filter(
        (row) =>
          [row.name, row.bank_name, row.account_name, row.account_number, row.nik].some(
            (v) => includesSearch(v, search),
          ) && passesSharedFilters(row, row.bank_name),
      ),
    [doctors, filters, search],
  );

  const filteredEmployees = useMemo(
    () =>
      (employees ?? []).filter(
        (row) =>
          [row.name, row.position, row.bank_name, row.account_name, row.account_number].some(
            (v) => includesSearch(v, search),
          ) && passesSharedFilters(row, row.position),
      ),
    [employees, filters, search],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const previewImport = useMutation({
    mutationFn: async ({ file, target }: { file: File; target: MasterTarget }) => {
      const form = new FormData();
      form.set("file", file);
      return api<ImportPreview>(`/master-data/import/${target}/preview`, {
        method: "POST",
        body: form,
      });
    },
    onMutate: ({ file, target }) => {
      setImportSession({ open: true, target, filename: file.name });
    },
    onSuccess: (preview, variables) => {
      setImportSession({
        open: true,
        target: variables.target,
        filename: variables.file.name,
        preview,
      });
    },
    onError: (error, variables) => {
      setImportSession({
        open: true,
        target: variables.target,
        filename: variables.file.name,
        error: error instanceof Error ? error.message : "Preview import gagal.",
      });
    },
  });

  const commitImport = useMutation({
    mutationFn: async ({
      target,
      importId,
    }: {
      target: MasterTarget;
      importId: number;
    }) =>
      api<CommitResult>(`/master-data/import/${target}/${importId}/commit`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      toasts.add({
        title: `Import ${MASTER_META[result.target].label} selesai`,
        description: `${result.created} dibuat, ${result.updated} diperbarui, ${result.unchanged} tetap, ${result.invalid_rows} invalid.`,
        variant: "success",
      });
      setImportSession((current) => ({ ...current, committed: result }));
      await queryClient.invalidateQueries({ queryKey: [result.target] });
    },
    onError: (error) => {
      setImportSession((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Commit import gagal.",
      }));
    },
  });

  const saveRecord = useMutation({
    mutationFn: async (session: EditorSession) => {
      const payload = editorPayload(session.target, session.values);
      const path =
        session.mode === "edit"
          ? `/${session.target}/${session.id}`
          : `/${session.target}`;
      return api(path, {
        method: session.mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (_, session) => {
      toasts.add({
        title: `${MASTER_META[session.target].label} ${session.mode === "edit" ? "diperbarui" : "ditambahkan"}`,
        variant: "success",
      });
      setEditor((current) => ({ ...current, open: false }));
      await queryClient.invalidateQueries({ queryKey: [session.target] });
    },
    onError: (error) =>
      toasts.add({
        title: "Data gagal disimpan",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const toggleActiveRecord = useMutation({
    mutationFn: async ({
      target,
      id,
      ids,
      active,
    }: {
      target: MasterTarget;
      id?: number;
      ids?: number[];
      active: boolean;
    }) => {
      const targets = ids ?? (id ? [id] : []);
      return Promise.all(
        targets.map((itemId) =>
          api(`/${target}/${itemId}/${active ? "activate" : "deactivate"}`, {
            method: "POST",
          }),
        ),
      );
    },
    onSuccess: async (_, variables) => {
      toasts.add({
        title: `${MASTER_META[variables.target].label} ${variables.active ? "diaktifkan kembali" : "dinonaktifkan"}`,
        variant: "success",
      });
      if (variables.ids?.length) clearSelection(variables.target);
      await queryClient.invalidateQueries({ queryKey: [variables.target] });
    },
    onError: (error) =>
      toasts.add({
        title: "Status data gagal diubah",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const permanentlyDeleteRecord = useMutation({
    mutationFn: async ({
      target,
      id,
      ids,
    }: {
      target: MasterTarget;
      id?: number;
      ids?: number[];
    }) => {
      const targets = ids ?? (id ? [id] : []);
      return Promise.all(
        targets.map((itemId) =>
          api(`/${target}/${itemId}/permanent`, { method: "DELETE" }),
        ),
      );
    },
    onSuccess: async (_, variables) => {
      toasts.add({
        title: `${MASTER_META[variables.target].label} dihapus permanen`,
        variant: "success",
      });
      setPermanentDelete((current) => ({ ...current, open: false }));
      clearSelection(variables.target);
      await queryClient.invalidateQueries({ queryKey: [variables.target] });
    },
    onError: (error) =>
      toasts.add({
        title: "Data gagal dihapus permanen",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  // ── Event handlers ────────────────────────────────────────────────────────
  function chooseTab(target: MasterTarget) {
    setActiveTab(target);
    setSearch("");
    setFilters({ status: "active", group: "all" });
  }

  function openCreate(target: MasterTarget) {
    setEditor({ open: true, target, mode: "create", values: emptyEditorValues(target) });
  }

  function openEdit(target: MasterTarget, id: number, row: Treatment | Doctor | Employee) {
    setEditor({ open: true, target, mode: "edit", id, values: editorValuesFromRow(target, row) });
  }

  function updateEditorValue(field: string, value: string) {
    setEditor((current) => ({
      ...current,
      values: { ...current.values, [field]: value },
    }));
  }

  function clearSelection(target: MasterTarget) {
    setSelectedRows((current) => ({ ...current, [target]: new Set() }));
  }

  function toggleSelected(target: MasterTarget, id: number, selected: boolean) {
    setSelectedRows((current) => {
      const next = new Set(current[target]);
      if (selected) next.add(id);
      else next.delete(id);
      return { ...current, [target]: next };
    });
  }

  function togglePageSelected(
    target: MasterTarget,
    rows: Array<{ id: number }>,
    selected: boolean,
  ) {
    setSelectedRows((current) => {
      const next = new Set(current[target]);
      rows.forEach((row) => {
        if (selected) next.add(row.id);
        else next.delete(row.id);
      });
      return { ...current, [target]: next };
    });
  }

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) previewImport.mutate({ file, target: activeTab });
    event.target.value = "";
  }

  async function exportMasterData() {
    setIsExporting(true);
    try {
      await downloadFile(
        "/master-data/export.xlsx",
        `master-data-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (error) {
      toasts.add({
        title: "Export master data gagal",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const meta = MASTER_META[activeTab];
  const preview = importSession.preview;
  const hasCommitReady = Boolean(
    preview && (preview.summary.new > 0 || preview.summary.update > 0) && !importSession.committed,
  );
  const selectedIds = Array.from(selectedRows[activeTab]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Master Data</h1>
          <p className="mt-1 text-sm text-gray-600">
            Sumber kebenaran treatment, dokter, dan karyawan
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            icon={<FileSpreadsheet size={18} />}
            loading={isExporting}
            onClick={exportMasterData}
          >
            Export Excel
          </Button>
          <LinkButton
            variant="secondary"
            href={`/api/reports/templates/${meta.template}.xlsx`}
            download={`${meta.template}-template.xlsx`}
            icon={<FileDown size={18} />}
          >
            Format {meta.singular}
          </LinkButton>
          <Button
            variant="secondary"
            icon={<Plus size={18} />}
            onClick={() => openCreate(activeTab)}
          >
            Tambah {meta.singular}
          </Button>
          <label className="relative inline-flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-kumo-brand px-3 text-white hover:bg-kumo-brand-hover">
            <FileUp size={18} />
            Import {meta.singular}
            <input
              className="absolute inset-0 cursor-pointer opacity-0"
              type="file"
              accept=".xlsx,.xls"
              onChange={onImport}
            />
          </label>
        </div>
      </div>

      {/* Tab selector */}
      <MasterTabBar
        activeTab={activeTab}
        counts={counts}
        onTabChange={chooseTab}
      />

      {/* Data card */}
      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <div>
            <Text as="h2" variant="heading3">
              {meta.label}
            </Text>
            <p className="mt-1 text-sm text-kumo-subtle">
              {counts[activeTab]} data tersimpan. Import selalu lewat preview
              sebelum commit.
            </p>
          </div>

          <MasterToolbar
            activeTab={activeTab}
            search={search}
            filters={filters}
            selectedIds={selectedIds}
            groupOptions={groupOptions}
            isTogglePending={toggleActiveRecord.isPending}
            onSearchChange={setSearch}
            onFilterChange={setFilters}
            onDeactivate={() =>
              toggleActiveRecord.mutate({
                target: activeTab,
                ids: selectedIds,
                active: false,
              })
            }
            onActivate={() =>
              toggleActiveRecord.mutate({
                target: activeTab,
                ids: selectedIds,
                active: true,
              })
            }
            onDeleteSelected={() =>
              setPermanentDelete({
                open: true,
                target: activeTab,
                ids: selectedIds,
                name: `${selectedIds.length} data terpilih`,
              })
            }
            onClearSelection={() => clearSelection(activeTab)}
          />
        </div>

        {/* Tables */}
        {activeTab === "treatments" ? (
            <TreatmentTable
              rows={filteredTreatments}
              selectedKeys={selectedRows.treatments}
              isTogglePending={toggleActiveRecord.isPending}
              isDeletePending={permanentlyDeleteRecord.isPending}
              onEdit={(id, row) => openEdit("treatments", id, row)}
              onToggleActive={(id, active) =>
                toggleActiveRecord.mutate({ target: "treatments", id, active })
              }
              onDelete={(id, name) =>
                setPermanentDelete({ open: true, target: "treatments", id, name })
              }
              onToggleRow={(row, selected) =>
                toggleSelected("treatments", row.id, selected)
              }
              onTogglePage={(rows, selected) =>
                togglePageSelected("treatments", rows, selected)
              }
            />
        ) : null}

        {activeTab === "doctors" ? (
            <DoctorTable
              rows={filteredDoctors}
              selectedKeys={selectedRows.doctors}
              isTogglePending={toggleActiveRecord.isPending}
              isDeletePending={permanentlyDeleteRecord.isPending}
              onEdit={(id, row) => openEdit("doctors", id, row)}
              onToggleActive={(id, active) =>
                toggleActiveRecord.mutate({ target: "doctors", id, active })
              }
              onDelete={(id, name) =>
                setPermanentDelete({ open: true, target: "doctors", id, name })
              }
              onToggleRow={(row, selected) =>
                toggleSelected("doctors", row.id, selected)
              }
              onTogglePage={(rows, selected) =>
                togglePageSelected("doctors", rows, selected)
              }
            />
        ) : null}

        {activeTab === "employees" ? (
            <EmployeeTable
              rows={filteredEmployees}
              selectedKeys={selectedRows.employees}
              isTogglePending={toggleActiveRecord.isPending}
              isDeletePending={permanentlyDeleteRecord.isPending}
              onEdit={(id, row) => openEdit("employees", id, row)}
              onToggleActive={(id, active) =>
                toggleActiveRecord.mutate({ target: "employees", id, active })
              }
              onDelete={(id, name) =>
                setPermanentDelete({ open: true, target: "employees", id, name })
              }
              onToggleRow={(row, selected) =>
                toggleSelected("employees", row.id, selected)
              }
              onTogglePage={(rows, selected) =>
                togglePageSelected("employees", rows, selected)
              }
            />
        ) : null}
      </LayerCard>

      {/* Footer hint */}
      <Banner
        variant="secondary"
        icon={<Building2 size={20} />}
        description="Workbook hasil export dapat diimport kembali dari tab yang sesuai. Jangan ubah kolom ID; kosongkan ID hanya untuk data baru."
      />

      {/* Dialogs */}
      <RecordEditorDialog
        editor={editor}
        isSaving={saveRecord.isPending}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onFieldChange={updateEditorValue}
        onSubmit={() => saveRecord.mutate(editor)}
      />

      <PermanentDeleteDialog
        session={permanentDelete}
        isDeleting={permanentlyDeleteRecord.isPending}
        onOpenChange={(open) =>
          setPermanentDelete((current) => ({ ...current, open }))
        }
        onConfirm={() => {
          if (permanentDelete.ids?.length) {
            permanentlyDeleteRecord.mutate({
              target: permanentDelete.target,
              ids: permanentDelete.ids,
            });
            return;
          }
          if (permanentDelete.id) {
            permanentlyDeleteRecord.mutate({
              target: permanentDelete.target,
              id: permanentDelete.id,
            });
          }
        }}
      />

      <ImportPreviewDialog
        session={importSession}
        isPreviewPending={previewImport.isPending}
        isCommitting={commitImport.isPending}
        hasCommitReady={hasCommitReady}
        onOpenChange={(open) =>
          setImportSession((current) => ({ ...current, open }))
        }
        onCommit={() =>
          preview &&
          commitImport.mutate({
            target: importSession.target,
            importId: preview.import_id,
          })
        }
      />
    </>
  );
}
