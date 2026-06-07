import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Field } from "@cloudflare/kumo/components/field";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Select } from "@cloudflare/kumo/components/select";
import { Table } from "@cloudflare/kumo/components/table";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FileUp,
  Pencil,
  Plus,
  PowerOff,
  RotateCcw,
  Search,
  Stethoscope,
  Trash2,
  Users,
} from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { api, rupiah } from "../lib/api";

type MasterTarget = "treatments" | "doctors" | "employees";

type Employee = {
  id: number;
  name: string;
  position?: string;
  join_date?: string;
  base_salary: number;
  working_days: number;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  is_active: boolean;
};

type Doctor = {
  id: number;
  name: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  nik?: string;
  normal_fee_rate: number;
  ortho_fee_rate: number;
  tax_rate: number;
  is_active: boolean;
};

type Treatment = {
  id: number;
  code?: string;
  name: string;
  category?: string;
  doctor_cost: number;
  specialist_cost: number;
  bhp_cost: number;
  service_fee: number;
  treatment_price: number;
  notes?: string;
  is_active: boolean;
};

type PreviewStatus = "new" | "update" | "invalid";

type PreviewRow = {
  row?: number;
  status: PreviewStatus;
  issues?: string[];
  code?: string;
  name?: string;
  category?: string;
  position?: string;
  bank_name?: string;
  account_number?: string;
  treatment_price?: number;
  base_salary?: number;
  normal_fee_rate?: number;
};

type ImportIssue = {
  sheet?: string;
  row?: number;
  field?: string;
  message: string;
};

type ImportPreview = {
  import_id: number;
  target: MasterTarget;
  valid_rows: number;
  invalid_rows: number;
  summary: {
    new: number;
    update: number;
    invalid: number;
    duplicate_in_file: number;
    [key: string]: number | string | string[];
  };
  rows: PreviewRow[];
  warnings: string[];
  errors: ImportIssue[];
};

type CommitResult = {
  target: MasterTarget;
  created: number;
  updated: number;
  invalid_rows: number;
};

type EditorSession = {
  open: boolean;
  target: MasterTarget;
  mode: "create" | "edit";
  id?: number;
  values: Record<string, string>;
};

type PermanentDeleteSession = {
  open: boolean;
  target: MasterTarget;
  id?: number;
  ids?: number[];
  name?: string;
};

type ImportSession = {
  open: boolean;
  target: MasterTarget;
  filename?: string;
  preview?: ImportPreview;
  error?: string;
  committed?: CommitResult;
};

type MasterFilters = {
  status: "active" | "inactive" | "all";
  group: string;
};

const MASTER_META: Record<
  MasterTarget,
  {
    label: string;
    singular: string;
    icon: ReactNode;
    description: string;
    template: string;
  }
> = {
  treatments: {
    label: "Treatment",
    singular: "Treatment",
    icon: <Search size={16} />,
    description: "Harga tindakan, BHP, jasa, kategori, dan kode treatment.",
    template: "treatments",
  },
  doctors: {
    label: "Dokter",
    singular: "Dokter",
    icon: <Stethoscope size={16} />,
    description: "Identitas dokter, rekening, NIK, dan default fee rate.",
    template: "doctors",
  },
  employees: {
    label: "Karyawan",
    singular: "Karyawan",
    icon: <Users size={16} />,
    description:
      "Profil karyawan, gaji pokok, hari kerja, dan rekening payroll.",
    template: "employees",
  },
};

function includesSearch(value: unknown, search: string) {
  return String(value ?? "")
    .toLowerCase()
    .includes(search.toLowerCase());
}

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
    success: "border-kumo-success/30 bg-kumo-success/5",
    warning: "border-kumo-warning/30 bg-kumo-warning/5",
    danger: "border-kumo-danger/30 bg-kumo-danger/5",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-normal text-kumo-subtle">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-kumo-default">
        {value}
      </div>
    </div>
  );
}

function previewIdentity(target: MasterTarget, row: PreviewRow) {
  if (target === "treatments")
    return row.code ? `${row.code} - ${row.name ?? "-"}` : (row.name ?? "-");
  return row.name ?? "-";
}

function previewDetail(target: MasterTarget, row: PreviewRow) {
  if (target === "treatments")
    return row.treatment_price === undefined
      ? (row.category ?? "-")
      : rupiah.format(row.treatment_price);
  if (target === "employees")
    return row.base_salary === undefined
      ? (row.position ?? "-")
      : rupiah.format(row.base_salary);
  if (row.normal_fee_rate === undefined) return row.bank_name ?? "-";
  return `${(row.normal_fee_rate * 100).toFixed(0)}% fee`;
}

function uniqueOptions(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );
}

function emptyEditorValues(target: MasterTarget): Record<string, string> {
  if (target === "treatments") {
    return {
      code: "",
      name: "",
      category: "",
      doctor_cost: "0",
      specialist_cost: "0",
      bhp_cost: "0",
      service_fee: "0",
      treatment_price: "0",
      notes: "",
      is_active: "true",
    };
  }
  if (target === "doctors") {
    return {
      name: "",
      bank_name: "",
      account_name: "",
      account_number: "",
      nik: "",
      normal_fee_rate: "0.6",
      ortho_fee_rate: "0.7",
      tax_rate: "0.025",
      is_active: "true",
    };
  }
  return {
    name: "",
    position: "",
    join_date: "",
    base_salary: "0",
    working_days: "25",
    bank_name: "",
    account_name: "",
    account_number: "",
    is_active: "true",
  };
}

function editorValuesFromRow(
  target: MasterTarget,
  row: Treatment | Doctor | Employee,
): Record<string, string> {
  if (target === "treatments") {
    const item = row as Treatment;
    return {
      code: item.code ?? "",
      name: item.name,
      category: item.category ?? "",
      doctor_cost: String(item.doctor_cost ?? 0),
      specialist_cost: String(item.specialist_cost ?? 0),
      bhp_cost: String(item.bhp_cost ?? 0),
      service_fee: String(item.service_fee ?? 0),
      treatment_price: String(item.treatment_price ?? 0),
      notes: item.notes ?? "",
      is_active: String(item.is_active),
    };
  }
  if (target === "doctors") {
    const item = row as Doctor;
    return {
      name: item.name,
      bank_name: item.bank_name ?? "",
      account_name: item.account_name ?? "",
      account_number: item.account_number ?? "",
      nik: item.nik ?? "",
      normal_fee_rate: String(item.normal_fee_rate ?? 0.6),
      ortho_fee_rate: String(item.ortho_fee_rate ?? 0.7),
      tax_rate: String(item.tax_rate ?? 0.025),
      is_active: String(item.is_active),
    };
  }
  const item = row as Employee;
  return {
    name: item.name,
    position: item.position ?? "",
    join_date: "",
    base_salary: String(item.base_salary ?? 0),
    working_days: String(item.working_days ?? 25),
    bank_name: item.bank_name ?? "",
    account_name: item.account_name ?? "",
    account_number: item.account_number ?? "",
    is_active: String(item.is_active),
  };
}

function nullableText(value: string) {
  return value.trim() || null;
}

function editorPayload(target: MasterTarget, values: Record<string, string>) {
  if (target === "treatments") {
    return {
      code: nullableText(values.code),
      name: values.name.trim(),
      category: nullableText(values.category),
      doctor_cost: Number(values.doctor_cost || 0),
      specialist_cost: Number(values.specialist_cost || 0),
      bhp_cost: Number(values.bhp_cost || 0),
      service_fee: Number(values.service_fee || 0),
      treatment_price: Number(values.treatment_price || 0),
      notes: nullableText(values.notes),
      is_active: values.is_active === "true",
    };
  }
  if (target === "doctors") {
    return {
      name: values.name.trim(),
      bank_name: nullableText(values.bank_name),
      account_name: nullableText(values.account_name),
      account_number: nullableText(values.account_number),
      nik: nullableText(values.nik),
      normal_fee_rate: Number(values.normal_fee_rate || 0),
      ortho_fee_rate: Number(values.ortho_fee_rate || 0),
      tax_rate: Number(values.tax_rate || 0),
      is_active: values.is_active === "true",
    };
  }
  return {
    name: values.name.trim(),
    position: nullableText(values.position),
    join_date: nullableText(values.join_date),
    base_salary: Number(values.base_salary || 0),
    working_days: Number(values.working_days || 25),
    bank_name: nullableText(values.bank_name),
    account_name: nullableText(values.account_name),
    account_number: nullableText(values.account_number),
    is_active: values.is_active === "true",
  };
}

export function MasterDataPage() {
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const [activeTab, setActiveTab] = useState<MasterTarget>("treatments");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MasterFilters>({
    status: "active",
    group: "all",
  });
  const [selectedRows, setSelectedRows] = useState<
    Record<MasterTarget, Set<number>>
  >({
    treatments: new Set(),
    doctors: new Set(),
    employees: new Set(),
  });
  const [importSession, setImportSession] = useState<ImportSession>({
    open: false,
    target: "treatments",
  });
  const [editor, setEditor] = useState<EditorSession>({
    open: false,
    target: "treatments",
    mode: "create",
    values: emptyEditorValues("treatments"),
  });
  const [permanentDelete, setPermanentDelete] =
    useState<PermanentDeleteSession>({ open: false, target: "treatments" });

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<Employee[]>("/employees"),
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => api<Doctor[]>("/doctors"),
  });
  const { data: treatments } = useQuery({
    queryKey: ["treatments"],
    queryFn: () => api<Treatment[]>("/treatments"),
  });

  const counts = {
    treatments: treatments?.length ?? 0,
    doctors: doctors?.length ?? 0,
    employees: employees?.length ?? 0,
  };

  const groupOptions = useMemo(() => {
    if (activeTab === "treatments")
      return uniqueOptions((treatments ?? []).map((row) => row.category));
    if (activeTab === "doctors")
      return uniqueOptions((doctors ?? []).map((row) => row.bank_name));
    return uniqueOptions((employees ?? []).map((row) => row.position));
  }, [activeTab, doctors, employees, treatments]);

  function passesSharedFilters(
    row: { is_active: boolean },
    groupValue?: string,
  ) {
    if (
      filters.status !== "all" &&
      row.is_active !== (filters.status === "active")
    )
      return false;
    if (filters.group !== "all" && groupValue !== filters.group) return false;
    return true;
  }

  const filteredTreatments = useMemo(() => {
    return (treatments ?? []).filter((row) => {
      return (
        [row.code, row.name, row.category, row.notes].some((value) =>
          includesSearch(value, search),
        ) && passesSharedFilters(row, row.category)
      );
    });
  }, [filters, search, treatments]);

  const filteredDoctors = useMemo(() => {
    return (doctors ?? []).filter((row) => {
      return (
        [
          row.name,
          row.bank_name,
          row.account_name,
          row.account_number,
          row.nik,
        ].some((value) => includesSearch(value, search)) &&
        passesSharedFilters(row, row.bank_name)
      );
    });
  }, [doctors, filters, search]);

  const filteredEmployees = useMemo(() => {
    return (employees ?? []).filter((row) => {
      return (
        [
          row.name,
          row.position,
          row.bank_name,
          row.account_name,
          row.account_number,
        ].some((value) => includesSearch(value, search)) &&
        passesSharedFilters(row, row.position)
      );
    });
  }, [employees, filters, search]);

  const previewImport = useMutation({
    mutationFn: async ({
      file,
      target,
    }: {
      file: File;
      target: MasterTarget;
    }) => {
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
    }) => {
      return api<CommitResult>(
        `/master-data/import/${target}/${importId}/commit`,
        { method: "POST" },
      );
    },
    onSuccess: async (result) => {
      toasts.add({
        title: `Import ${MASTER_META[result.target].label} selesai`,
        description: `${result.created} dibuat, ${result.updated} diperbarui, ${result.invalid_rows} invalid.`,
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

  function chooseTab(target: MasterTarget) {
    setActiveTab(target);
    setSearch("");
    setFilters({
      status: "active",
      group: "all",
    });
  }

  function openCreate(target: MasterTarget) {
    setEditor({
      open: true,
      target,
      mode: "create",
      values: emptyEditorValues(target),
    });
  }

  function openEdit(
    target: MasterTarget,
    id: number,
    row: Treatment | Doctor | Employee,
  ) {
    setEditor({
      open: true,
      target,
      mode: "edit",
      id,
      values: editorValuesFromRow(target, row),
    });
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

  function actionButtons(
    target: MasterTarget,
    id: number,
    row: Treatment | Doctor | Employee,
  ) {
    const active = row.is_active;
    return (
      <div
        className="flex justify-end gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="secondary"
          shape="square"
          aria-label={`Edit ${MASTER_META[target].label}`}
          title="Edit"
          icon={<Pencil size={16} />}
          onClick={() => openEdit(target, id, row)}
        />
        <Button
          variant="secondary"
          shape="square"
          aria-label={`${active ? "Nonaktifkan" : "Aktifkan"} ${MASTER_META[target].label}`}
          title={active ? "Nonaktifkan" : "Aktifkan kembali"}
          icon={active ? <PowerOff size={16} /> : <RotateCcw size={16} />}
          loading={toggleActiveRecord.isPending}
          onClick={() =>
            toggleActiveRecord.mutate({ target, id, active: !active })
          }
        />
        <Button
          variant="secondary-destructive"
          shape="square"
          aria-label={`Hapus permanen ${MASTER_META[target].label}`}
          title="Hapus permanen"
          icon={<Trash2 size={16} />}
          loading={permanentlyDeleteRecord.isPending}
          onClick={() =>
            setPermanentDelete({ open: true, target, id, name: row.name })
          }
        />
      </div>
    );
  }

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) previewImport.mutate({ file, target: activeTab });
    event.target.value = "";
  }

  const meta = MASTER_META[activeTab];
  const preview = importSession.preview;
  const hasCommitReady = Boolean(
    preview && preview.valid_rows > 0 && !importSession.committed,
  );
  const selectedIds = Array.from(selectedRows[activeTab]);

  return (
    <>
      <PageHeader
        title="Master Data"
        eyebrow="Sumber kebenaran treatment, dokter, dan karyawan"
        actions={
          <>
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
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {(Object.keys(MASTER_META) as MasterTarget[]).map((target) => (
          <button
            key={target}
            type="button"
            className={`rounded-lg border p-4 text-left transition hover:bg-kumo-tint ${
              activeTab === target
                ? "border-kumo-brand bg-kumo-brand/5"
                : "border-kumo-hairline bg-kumo-base"
            }`}
            onClick={() => chooseTab(target)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium text-kumo-default">
                {MASTER_META[target].icon}
                {MASTER_META[target].label}
              </div>
              <Badge variant={activeTab === target ? "success" : "secondary"}>
                {counts[target]}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-5 text-kumo-subtle">
              {MASTER_META[target].description}
            </p>
          </button>
        ))}
      </div>

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
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Search size={16} className="text-kumo-subtle" />
              <Input
                aria-label={`Cari ${meta.label}`}
                placeholder={`Cari ${meta.label.toLowerCase()}...`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              className="w-36"
              aria-label="Filter status"
              value={filters.status}
              renderValue={(value) =>
                value === "active"
                  ? "Aktif"
                  : value === "inactive"
                    ? "Nonaktif"
                    : "Semua status"
              }
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  status: value as MasterFilters["status"],
                }))
              }
            >
              <Select.Option value="active">Aktif</Select.Option>
              <Select.Option value="inactive">Nonaktif</Select.Option>
              <Select.Option value="all">Semua status</Select.Option>
            </Select>
            <Select
              className="w-44"
              aria-label={`Filter ${activeTab === "treatments" ? "kategori" : activeTab === "doctors" ? "bank" : "jabatan"}`}
              value={filters.group}
              renderValue={(value) =>
                String(value) === "all"
                  ? activeTab === "treatments"
                    ? "Semua kategori"
                    : activeTab === "doctors"
                      ? "Semua bank"
                      : "Semua jabatan"
                  : String(value)
              }
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, group: String(value) }))
              }
            >
              <Select.Option value="all">
                {activeTab === "treatments"
                  ? "Semua kategori"
                  : activeTab === "doctors"
                    ? "Semua bank"
                    : "Semua jabatan"}
              </Select.Option>
              {groupOptions.map((option) => (
                <Select.Option key={option} value={option}>
                  {option}
                </Select.Option>
              ))}
            </Select>
          </div>
          {selectedIds.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-hairline bg-kumo-base px-3 py-2">
              <span className="text-sm font-medium text-kumo-default">
                {selectedIds.length}{" "}
                {MASTER_META[activeTab].label.toLowerCase()} dipilih
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<PowerOff size={15} />}
                  loading={toggleActiveRecord.isPending}
                  onClick={() =>
                    toggleActiveRecord.mutate({
                      target: activeTab,
                      ids: selectedIds,
                      active: false,
                    })
                  }
                >
                  Nonaktifkan
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RotateCcw size={15} />}
                  loading={toggleActiveRecord.isPending}
                  onClick={() =>
                    toggleActiveRecord.mutate({
                      target: activeTab,
                      ids: selectedIds,
                      active: true,
                    })
                  }
                >
                  Aktifkan
                </Button>
                <Button
                  variant="secondary-destructive"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  onClick={() =>
                    setPermanentDelete({
                      open: true,
                      target: activeTab,
                      ids: selectedIds,
                      name: `${selectedIds.length} data terpilih`,
                    })
                  }
                >
                  Hapus permanen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearSelection(activeTab)}
                >
                  Batal pilih
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {activeTab === "treatments" ? (
          <DataTable
            rows={filteredTreatments}
            columns={[
              { key: "code", header: "Kode", render: (row) => row.code ?? "-" },
              {
                key: "name",
                header: "Nama Treatment",
                render: (row) => row.name,
              },
              {
                key: "category",
                header: "Kategori",
                render: (row) => row.category ?? "-",
              },
              {
                key: "doctor",
                header: "Jasa Dokter",
                align: "right",
                render: (row) => rupiah.format(row.doctor_cost),
              },
              {
                key: "bhp",
                header: "BHP",
                align: "right",
                render: (row) => rupiah.format(row.bhp_cost),
              },
              {
                key: "price",
                header: "Harga",
                align: "right",
                render: (row) => rupiah.format(row.treatment_price),
              },
              {
                key: "active",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.is_active ? "success" : "secondary"}>
                    {row.is_active ? "aktif" : "nonaktif"}
                  </Badge>
                ),
              },
              {
                key: "actions",
                header: "Aksi",
                align: "right",
                render: (row) => actionButtons("treatments", row.id, row),
              },
            ]}
            pagination
            rowKey={(row) => row.id}
            selectable
            selectedKeys={selectedRows.treatments}
            onToggleRow={(row, selected) =>
              toggleSelected("treatments", row.id, selected)
            }
            onTogglePage={(rows, selected) =>
              togglePageSelected("treatments", rows, selected)
            }
          />
        ) : null}

        {activeTab === "doctors" ? (
          <DataTable
            rows={filteredDoctors}
            columns={[
              { key: "name", header: "Nama", render: (row) => row.name },
              {
                key: "bank",
                header: "Bank",
                render: (row) => row.bank_name ?? "-",
              },
              {
                key: "account",
                header: "No Rekening",
                render: (row) => row.account_number ?? "-",
              },
              {
                key: "account_name",
                header: "Nama Rekening",
                render: (row) => row.account_name ?? "-",
              },
              { key: "nik", header: "NIK", render: (row) => row.nik ?? "-" },
              {
                key: "fee",
                header: "Fee",
                align: "right",
                render: (row) =>
                  `${(row.normal_fee_rate * 100).toFixed(0)}% / ${(row.ortho_fee_rate * 100).toFixed(0)}%`,
              },
              {
                key: "tax",
                header: "Pajak",
                align: "right",
                render: (row) => `${(row.tax_rate * 100).toFixed(1)}%`,
              },
              {
                key: "active",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.is_active ? "success" : "secondary"}>
                    {row.is_active ? "aktif" : "nonaktif"}
                  </Badge>
                ),
              },
              {
                key: "actions",
                header: "Aksi",
                align: "right",
                render: (row) => actionButtons("doctors", row.id, row),
              },
            ]}
            pagination
            rowKey={(row) => row.id}
            selectable
            selectedKeys={selectedRows.doctors}
            onToggleRow={(row, selected) =>
              toggleSelected("doctors", row.id, selected)
            }
            onTogglePage={(rows, selected) =>
              togglePageSelected("doctors", rows, selected)
            }
          />
        ) : null}

        {activeTab === "employees" ? (
          <DataTable
            rows={filteredEmployees}
            columns={[
              { key: "name", header: "Nama", render: (row) => row.name },
              {
                key: "position",
                header: "Jabatan",
                render: (row) => row.position ?? "-",
              },
              {
                key: "salary",
                header: "Gaji Pokok",
                align: "right",
                render: (row) => rupiah.format(row.base_salary),
              },
              {
                key: "days",
                header: "Hari Kerja",
                align: "right",
                render: (row) => row.working_days,
              },
              {
                key: "bank",
                header: "Bank",
                render: (row) => row.bank_name ?? "-",
              },
              {
                key: "account",
                header: "No Rekening",
                render: (row) => row.account_number ?? "-",
              },
              {
                key: "active",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.is_active ? "success" : "secondary"}>
                    {row.is_active ? "aktif" : "nonaktif"}
                  </Badge>
                ),
              },
              {
                key: "actions",
                header: "Aksi",
                align: "right",
                render: (row) => actionButtons("employees", row.id, row),
              },
            ]}
            pagination
            rowKey={(row) => row.id}
            selectable
            selectedKeys={selectedRows.employees}
            onToggleRow={(row, selected) =>
              toggleSelected("employees", row.id, selected)
            }
            onTogglePage={(rows, selected) =>
              togglePageSelected("employees", rows, selected)
            }
          />
        ) : null}
      </LayerCard>

      <div className="pb-8">
        <Banner
          variant="secondary"
          icon={<Building2 size={20} />}
          description="Master data hanya menerima template khusus per tab. File transaksi fee dokter dan absensi tetap diimport dari halaman masing-masing."
        />
      </div>

      <Dialog.Root
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
      >
        <Dialog size="xl" className="max-h-[90vh] overflow-hidden p-0">
          <form
            className="master-editor-form flex max-h-[90vh] flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              saveRecord.mutate(editor);
            }}
          >
            <div className="border-b border-kumo-hairline px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-lg font-bold">
                    {editor.mode === "edit" ? "Edit" : "Tambah"}{" "}
                    {MASTER_META[editor.target].label}
                  </Dialog.Title>
                  <Dialog.Description>
                    Isi data master dengan value final yang dipakai untuk
                    kalkulasi.
                  </Dialog.Description>
                </div>
                <Badge
                  variant={editor.mode === "edit" ? "secondary" : "success"}
                >
                  {editor.mode === "edit" ? "Edit data" : "Data baru"}
                </Badge>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <Grid variant="2up" gap="sm">
                <GridItem className="md:col-span-2">
                  <Field label="Nama" required>
                    <Input
                      required
                      value={editor.values.name ?? ""}
                      onChange={(event) =>
                        updateEditorValue("name", event.target.value)
                      }
                    />
                  </Field>
                </GridItem>

                {editor.target === "treatments" ? (
                  <>
                    <Field label="Kode" labelTooltip="Kode unik treatment, contoh: TRT-001" required={false}>
                      <Input
                        value={editor.values.code ?? ""}
                        onChange={(event) =>
                          updateEditorValue("code", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Kategori" required={false}>
                      <Input
                        value={editor.values.category ?? ""}
                        onChange={(event) =>
                          updateEditorValue("category", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Jasa Dokter" labelTooltip="Jasa dokter umum dari total harga treatment">
                      <Input
                        type="number"
                        value={editor.values.doctor_cost ?? "0"}
                        onChange={(event) =>
                          updateEditorValue("doctor_cost", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Jasa Spesialis" labelTooltip="Jasa dokter spesialis dari total harga treatment">
                      <Input
                        type="number"
                        value={editor.values.specialist_cost ?? "0"}
                        onChange={(event) =>
                          updateEditorValue(
                            "specialist_cost",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="BHP" labelTooltip="Biaya Habis Pakai (bahan dan alat sekali pakai)">
                      <Input
                        type="number"
                        value={editor.values.bhp_cost ?? "0"}
                        onChange={(event) =>
                          updateEditorValue("bhp_cost", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Service Fee" labelTooltip="Biaya layanan dan administrasi">
                      <Input
                        type="number"
                        value={editor.values.service_fee ?? "0"}
                        onChange={(event) =>
                          updateEditorValue("service_fee", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Harga Treatment" labelTooltip="Harga total yang dibayar pasien">
                      <Input
                        type="number"
                        value={editor.values.treatment_price ?? "0"}
                        onChange={(event) =>
                          updateEditorValue(
                            "treatment_price",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Status">
                      <Select
                        aria-label="Status treatment"
                        value={editor.values.is_active}
                        renderValue={(value) =>
                          value === "true" ? "Aktif" : "Nonaktif"
                        }
                        onValueChange={(value) =>
                          updateEditorValue("is_active", String(value))
                        }
                      >
                        <Select.Option value="true">Aktif</Select.Option>
                        <Select.Option value="false">Nonaktif</Select.Option>
                      </Select>
                    </Field>
                    <GridItem className="md:col-span-2">
                      <Field label="Catatan" required={false}>
                        <Input
                          value={editor.values.notes ?? ""}
                          onChange={(event) =>
                            updateEditorValue("notes", event.target.value)
                          }
                        />
                      </Field>
                    </GridItem>
                  </>
                ) : null}

                {editor.target === "doctors" ? (
                  <>
                    <Field label="Bank" required={false}>
                      <Input
                        value={editor.values.bank_name ?? ""}
                        onChange={(event) =>
                          updateEditorValue("bank_name", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Nama Rekening" required={false}>
                      <Input
                        value={editor.values.account_name ?? ""}
                        onChange={(event) =>
                          updateEditorValue("account_name", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="No Rekening" required={false}>
                      <Input
                        value={editor.values.account_number ?? ""}
                        onChange={(event) =>
                          updateEditorValue(
                            "account_number",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="NIK" labelTooltip="Nomor Induk Kependudukan" required={false}>
                      <Input
                        value={editor.values.nik ?? ""}
                        onChange={(event) =>
                          updateEditorValue("nik", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Fee Normal" labelTooltip="Persentase fee tindakan normal (contoh: 0.6 = 60%)">
                      <Input
                        type="number"
                        step="0.001"
                        value={editor.values.normal_fee_rate ?? "0"}
                        onChange={(event) =>
                          updateEditorValue(
                            "normal_fee_rate",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Fee Ortho" labelTooltip="Persentase fee tindakan orthodonti (contoh: 0.7 = 70%)">
                      <Input
                        type="number"
                        step="0.001"
                        value={editor.values.ortho_fee_rate ?? "0"}
                        onChange={(event) =>
                          updateEditorValue(
                            "ortho_fee_rate",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Pajak" labelTooltip="Tarif pajak penghasilan dokter (contoh: 0.025 = 2.5%)">
                      <Input
                        type="number"
                        step="0.001"
                        value={editor.values.tax_rate ?? "0"}
                        onChange={(event) =>
                          updateEditorValue("tax_rate", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Status">
                      <Select
                        aria-label="Status dokter"
                        value={editor.values.is_active}
                        renderValue={(value) =>
                          value === "true" ? "Aktif" : "Nonaktif"
                        }
                        onValueChange={(value) =>
                          updateEditorValue("is_active", String(value))
                        }
                      >
                        <Select.Option value="true">Aktif</Select.Option>
                        <Select.Option value="false">Nonaktif</Select.Option>
                      </Select>
                    </Field>
                  </>
                ) : null}

                {editor.target === "employees" ? (
                  <>
                    <Field label="Jabatan" required={false}>
                      <Input
                        value={editor.values.position ?? ""}
                        onChange={(event) =>
                          updateEditorValue("position", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Tanggal Masuk" required={false}>
                      <Input
                        type="date"
                        value={editor.values.join_date ?? ""}
                        onChange={(event) =>
                          updateEditorValue("join_date", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Gaji Pokok" labelTooltip="Gaji pokok bulanan sebelum tunjangan">
                      <Input
                        type="number"
                        value={editor.values.base_salary ?? "0"}
                        onChange={(event) =>
                          updateEditorValue("base_salary", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Hari Kerja" labelTooltip="Jumlah hari kerja dalam sebulan untuk perhitungan gaji">
                      <Input
                        type="number"
                        value={editor.values.working_days ?? "25"}
                        onChange={(event) =>
                          updateEditorValue("working_days", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Bank" required={false}>
                      <Input
                        value={editor.values.bank_name ?? ""}
                        onChange={(event) =>
                          updateEditorValue("bank_name", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Nama Rekening" required={false}>
                      <Input
                        value={editor.values.account_name ?? ""}
                        onChange={(event) =>
                          updateEditorValue("account_name", event.target.value)
                        }
                      />
                    </Field>
                    <Field label="No Rekening" required={false}>
                      <Input
                        value={editor.values.account_number ?? ""}
                        onChange={(event) =>
                          updateEditorValue(
                            "account_number",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field label="Status">
                      <Select
                        aria-label="Status karyawan"
                        value={editor.values.is_active}
                        renderValue={(value) =>
                          value === "true" ? "Aktif" : "Nonaktif"
                        }
                        onValueChange={(value) =>
                          updateEditorValue("is_active", String(value))
                        }
                      >
                        <Select.Option value="true">Aktif</Select.Option>
                        <Select.Option value="false">Nonaktif</Select.Option>
                      </Select>
                    </Field>
                  </>
                ) : null}
              </Grid>
            </div>

            <div className="flex justify-end gap-2 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
              <Dialog.Close
                render={(props) => (
                  <Button {...props} variant="secondary" type="button">
                    Batal
                  </Button>
                )}
              />
              <Button
                variant="primary"
                type="submit"
                loading={saveRecord.isPending}
                disabled={!editor.values.name?.trim()}
              >
                Simpan
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root
        role="alertdialog"
        open={permanentDelete.open}
        onOpenChange={(open) =>
          setPermanentDelete((current) => ({ ...current, open }))
        }
      >
        <Dialog size="base" className="p-4">
          <Dialog.Title>
            Hapus permanen {MASTER_META[permanentDelete.target].label}?
          </Dialog.Title>
          <Dialog.Description>
            {permanentDelete.name
              ? `${permanentDelete.name} akan dihapus permanen.`
              : "Data ini akan dihapus permanen."}{" "}
            Jika data sudah dipakai transaksi, sistem akan menolak penghapusan.
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary">
                  Batal
                </Button>
              )}
            />
            <Button
              variant="destructive"
              icon={<Trash2 size={16} />}
              loading={permanentlyDeleteRecord.isPending}
              disabled={!permanentDelete.id && !permanentDelete.ids?.length}
              onClick={() => {
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
            >
              Hapus permanen
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root
        open={importSession.open}
        onOpenChange={(open) =>
          setImportSession((current) => ({ ...current, open }))
        }
      >
        <Dialog size="xl" className="max-h-[90vh] overflow-hidden p-0">
          <div className="border-b border-kumo-hairline p-5">
            <Dialog.Title>
              Preview Import {MASTER_META[importSession.target].label}
            </Dialog.Title>
            <Dialog.Description>
              {importSession.filename ?? "File Excel"} akan dicek sebelum
              mengubah master data.
            </Dialog.Description>
          </div>

          <div className="max-h-[62vh] overflow-auto p-5">
            {previewImport.isPending ? (
              <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-kumo-subtle">
                <Loader />
                <span>Membaca workbook dan memvalidasi baris...</span>
              </div>
            ) : null}

            {importSession.error && !previewImport.isPending ? (
              <Banner
                variant="error"
                icon={<AlertTriangle size={20} />}
                description={importSession.error}
              />
            ) : null}

            {preview && !previewImport.isPending ? (
              <div className="space-y-5">
                {importSession.committed ? (
                  <Banner
                    variant="default"
                    icon={<CheckCircle2 size={20} />}
                    description={`Import selesai: ${importSession.committed.created} dibuat, ${importSession.committed.updated} diperbarui.`}
                  />
                ) : null}

                <div className="grid gap-3 md:grid-cols-5">
                  {summaryMetric("Valid", preview.valid_rows, "success")}
                  {summaryMetric(
                    "Invalid",
                    preview.invalid_rows,
                    preview.invalid_rows ? "danger" : "default",
                  )}
                  {summaryMetric("Baru", preview.summary.new ?? 0, "success")}
                  {summaryMetric(
                    "Update",
                    preview.summary.update ?? 0,
                    "warning",
                  )}
                  {summaryMetric(
                    "Duplikat file",
                    preview.summary.duplicate_in_file ?? 0,
                    preview.summary.duplicate_in_file ? "danger" : "default",
                  )}
                </div>

                <div className="overflow-auto rounded-lg border border-kumo-hairline bg-kumo-base">
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
                        preview.rows.slice(0, 80).map((row, index) => (
                          <Table.Row
                            key={`${row.row ?? index}-${row.name ?? index}`}
                          >
                            <Table.Cell>{row.row ?? "-"}</Table.Cell>
                            <Table.Cell>
                              {previewIdentity(importSession.target, row)}
                            </Table.Cell>
                            <Table.Cell>
                              {previewDetail(importSession.target, row)}
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

                {preview.errors.length ? (
                  <div className="rounded-lg border border-kumo-danger/30 bg-kumo-danger/5 p-4">
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
                          {error.field ? `(${error.field})` : ""}:{" "}
                          {error.message}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-kumo-hairline p-4">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary">
                  Tutup
                </Button>
              )}
            />
            <Button
              variant="primary"
              loading={commitImport.isPending}
              disabled={!hasCommitReady || commitImport.isPending}
              onClick={() =>
                preview &&
                commitImport.mutate({
                  target: importSession.target,
                  importId: preview.import_id,
                })
              }
            >
              Commit Import
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
