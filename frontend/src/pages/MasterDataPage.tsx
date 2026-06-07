import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Empty } from "@cloudflare/kumo/components/empty";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Select } from "@cloudflare/kumo/components/select";
import { Table } from "@cloudflare/kumo/components/table";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, FileDown, FileSpreadsheet, FileUp, Pencil, Plus, Search, Stethoscope, Trash2, Users } from "lucide-react";
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
  minAmount: string;
  maxAmount: string;
};

const MASTER_META: Record<MasterTarget, { label: string; singular: string; icon: ReactNode; description: string; template: string }> = {
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
    description: "Profil karyawan, gaji pokok, hari kerja, dan rekening payroll.",
    template: "employees",
  },
};

function includesSearch(value: unknown, search: string) {
  return String(value ?? "").toLowerCase().includes(search.toLowerCase());
}

function statusBadge(status: PreviewStatus) {
  if (status === "new") return <Badge variant="success">baru</Badge>;
  if (status === "update") return <Badge variant="secondary">update</Badge>;
  return <Badge variant="error">invalid</Badge>;
}

function summaryMetric(label: string, value: number, tone: "default" | "success" | "warning" | "danger" = "default") {
  const toneClass = {
    default: "border-kumo-hairline bg-kumo-base",
    success: "border-kumo-success/30 bg-kumo-success/5",
    warning: "border-kumo-warning/30 bg-kumo-warning/5",
    danger: "border-kumo-danger/30 bg-kumo-danger/5",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-normal text-kumo-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-kumo-default">{value}</div>
    </div>
  );
}

function previewIdentity(target: MasterTarget, row: PreviewRow) {
  if (target === "treatments") return row.code ? `${row.code} - ${row.name ?? "-"}` : row.name ?? "-";
  return row.name ?? "-";
}

function previewDetail(target: MasterTarget, row: PreviewRow) {
  if (target === "treatments") return row.treatment_price === undefined ? row.category ?? "-" : rupiah.format(row.treatment_price);
  if (target === "employees") return row.base_salary === undefined ? row.position ?? "-" : rupiah.format(row.base_salary);
  if (row.normal_fee_rate === undefined) return row.bank_name ?? "-";
  return `${(row.normal_fee_rate * 100).toFixed(0)}% fee`;
}

function uniqueOptions(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function emptyEditorValues(target: MasterTarget): Record<string, string> {
  if (target === "treatments") {
    return { code: "", name: "", category: "", doctor_cost: "0", specialist_cost: "0", bhp_cost: "0", service_fee: "0", treatment_price: "0", notes: "", is_active: "true" };
  }
  if (target === "doctors") {
    return { name: "", bank_name: "", account_name: "", account_number: "", nik: "", normal_fee_rate: "0.6", ortho_fee_rate: "0.7", tax_rate: "0.025", is_active: "true" };
  }
  return { name: "", position: "", join_date: "", base_salary: "0", working_days: "25", bank_name: "", account_name: "", account_number: "", is_active: "true" };
}

function editorValuesFromRow(target: MasterTarget, row: Treatment | Doctor | Employee): Record<string, string> {
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
  const [activeTab, setActiveTab] = useState<MasterTarget>("treatments");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MasterFilters>({ status: "active", group: "all", minAmount: "", maxAmount: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [importSession, setImportSession] = useState<ImportSession>({ open: false, target: "treatments" });
  const [editor, setEditor] = useState<EditorSession>({ open: false, target: "treatments", mode: "create", values: emptyEditorValues("treatments") });

  const { data: employees } = useQuery({ queryKey: ["employees"], queryFn: () => api<Employee[]>("/employees") });
  const { data: doctors } = useQuery({ queryKey: ["doctors"], queryFn: () => api<Doctor[]>("/doctors") });
  const { data: treatments } = useQuery({ queryKey: ["treatments"], queryFn: () => api<Treatment[]>("/treatments") });

  const counts = {
    treatments: treatments?.length ?? 0,
    doctors: doctors?.length ?? 0,
    employees: employees?.length ?? 0,
  };

  const groupOptions = useMemo(() => {
    if (activeTab === "treatments") return uniqueOptions((treatments ?? []).map((row) => row.category));
    if (activeTab === "doctors") return uniqueOptions((doctors ?? []).map((row) => row.bank_name));
    return uniqueOptions((employees ?? []).map((row) => row.position));
  }, [activeTab, doctors, employees, treatments]);

  function passesSharedFilters(row: { is_active: boolean }, amount: number, groupValue?: string) {
    if (filters.status !== "all" && row.is_active !== (filters.status === "active")) return false;
    if (filters.group !== "all" && groupValue !== filters.group) return false;
    if (filters.minAmount && amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount && amount > Number(filters.maxAmount)) return false;
    return true;
  }

  const filteredTreatments = useMemo(() => {
    return (treatments ?? []).filter((row) => {
      return [row.code, row.name, row.category, row.notes].some((value) => includesSearch(value, search)) && passesSharedFilters(row, row.treatment_price, row.category);
    });
  }, [filters, search, treatments]);

  const filteredDoctors = useMemo(() => {
    return (doctors ?? []).filter((row) => {
      return [row.name, row.bank_name, row.account_name, row.account_number, row.nik].some((value) => includesSearch(value, search)) && passesSharedFilters(row, row.normal_fee_rate, row.bank_name);
    });
  }, [doctors, filters, search]);

  const filteredEmployees = useMemo(() => {
    return (employees ?? []).filter((row) => {
      return [row.name, row.position, row.bank_name, row.account_name, row.account_number].some((value) => includesSearch(value, search)) && passesSharedFilters(row, row.base_salary, row.position);
    });
  }, [employees, filters, search]);

  const previewImport = useMutation({
    mutationFn: async ({ file, target }: { file: File; target: MasterTarget }) => {
      const form = new FormData();
      form.set("file", file);
      return api<ImportPreview>(`/master-data/import/${target}/preview`, { method: "POST", body: form });
    },
    onMutate: ({ file, target }) => {
      setMessage(null);
      setImportSession({ open: true, target, filename: file.name });
    },
    onSuccess: (preview, variables) => {
      setImportSession({ open: true, target: variables.target, filename: variables.file.name, preview });
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
    mutationFn: async ({ target, importId }: { target: MasterTarget; importId: number }) => {
      return api<CommitResult>(`/master-data/import/${target}/${importId}/commit`, { method: "POST" });
    },
    onSuccess: async (result) => {
      setMessage(`Import ${MASTER_META[result.target].label}: ${result.created} dibuat, ${result.updated} diperbarui, ${result.invalid_rows} invalid.`);
      setImportSession((current) => ({ ...current, committed: result }));
      await queryClient.invalidateQueries({ queryKey: [result.target] });
    },
    onError: (error) => {
      setImportSession((current) => ({ ...current, error: error instanceof Error ? error.message : "Commit import gagal." }));
    },
  });

  const saveRecord = useMutation({
    mutationFn: async (session: EditorSession) => {
      const payload = editorPayload(session.target, session.values);
      const path = session.mode === "edit" ? `/${session.target}/${session.id}` : `/${session.target}`;
      return api(path, { method: session.mode === "edit" ? "PATCH" : "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (_, session) => {
      setMessage(`${MASTER_META[session.target].label} ${session.mode === "edit" ? "diperbarui" : "ditambahkan"}.`);
      setEditor((current) => ({ ...current, open: false }));
      await queryClient.invalidateQueries({ queryKey: [session.target] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Data gagal disimpan."),
  });

  const deleteRecord = useMutation({
    mutationFn: async ({ target, id }: { target: MasterTarget; id: number }) => {
      return api(`/${target}/${id}`, { method: "DELETE" });
    },
    onSuccess: async (_, variables) => {
      setMessage(`${MASTER_META[variables.target].label} dinonaktifkan.`);
      await queryClient.invalidateQueries({ queryKey: [variables.target] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Data gagal dinonaktifkan."),
  });

  function chooseTab(target: MasterTarget) {
    setActiveTab(target);
    setSearch("");
    setFilters({ status: "active", group: "all", minAmount: "", maxAmount: "" });
  }

  function openCreate(target: MasterTarget) {
    setEditor({ open: true, target, mode: "create", values: emptyEditorValues(target) });
  }

  function openEdit(target: MasterTarget, id: number, row: Treatment | Doctor | Employee) {
    setEditor({ open: true, target, mode: "edit", id, values: editorValuesFromRow(target, row) });
  }

  function updateEditorValue(field: string, value: string) {
    setEditor((current) => ({ ...current, values: { ...current.values, [field]: value } }));
  }

  function actionButtons(target: MasterTarget, id: number, row: Treatment | Doctor | Employee) {
    return (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" shape="square" aria-label={`Edit ${MASTER_META[target].label}`} title="Edit" icon={<Pencil size={16} />} onClick={() => openEdit(target, id, row)} />
        <Button
          variant="secondary-destructive"
          shape="square"
          aria-label={`Nonaktifkan ${MASTER_META[target].label}`}
          title="Nonaktifkan"
          icon={<Trash2 size={16} />}
          loading={deleteRecord.isPending}
          onClick={() => deleteRecord.mutate({ target, id })}
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
  const hasCommitReady = Boolean(preview && preview.valid_rows > 0 && !importSession.committed);

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
            <Button variant="secondary" icon={<Plus size={18} />} onClick={() => openCreate(activeTab)}>
              Tambah {meta.singular}
            </Button>
            <label className="relative inline-flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg bg-kumo-brand px-3 text-white hover:bg-kumo-brand-hover">
              <FileUp size={18} />
              Import {meta.singular}
              <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept=".xlsx,.xls" onChange={onImport} />
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
              activeTab === target ? "border-kumo-brand bg-kumo-brand/5" : "border-kumo-hairline bg-kumo-base"
            }`}
            onClick={() => chooseTab(target)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium text-kumo-default">
                {MASTER_META[target].icon}
                {MASTER_META[target].label}
              </div>
              <Badge variant={activeTab === target ? "success" : "secondary"}>{counts[target]}</Badge>
            </div>
            <p className="mt-2 text-sm leading-5 text-kumo-subtle">{MASTER_META[target].description}</p>
          </button>
        ))}
      </div>

      {message ? <Banner variant="default" icon={<CheckCircle2 size={20} />} description={message} /> : null}

      <LayerCard className="p-4">
        <div className="mb-6 flex flex-col gap-5">
          <div>
            <Text as="h2" variant="heading3">{meta.label}</Text>
            <p className="mt-1 text-sm text-kumo-subtle">{counts[activeTab]} data tersimpan. Import selalu lewat preview sebelum commit.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.9fr_0.7fr_0.7fr]">
            <div className="flex items-center gap-2">
              <Search size={18} className="text-kumo-subtle" />
              <Input aria-label={`Cari ${meta.label}`} placeholder={`Cari ${meta.label.toLowerCase()}...`} value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select
              aria-label="Filter status"
              value={filters.status}
              renderValue={(value) => value === "active" ? "Aktif" : value === "inactive" ? "Nonaktif" : "Semua status"}
              onValueChange={(value) => setFilters((current) => ({ ...current, status: value as MasterFilters["status"] }))}
            >
              <Select.Option value="active">Aktif</Select.Option>
              <Select.Option value="inactive">Nonaktif</Select.Option>
              <Select.Option value="all">Semua status</Select.Option>
            </Select>
            <Select
              aria-label={`Filter ${activeTab === "treatments" ? "kategori" : activeTab === "doctors" ? "bank" : "jabatan"}`}
              value={filters.group}
              renderValue={(value) => String(value) === "all" ? activeTab === "treatments" ? "Semua kategori" : activeTab === "doctors" ? "Semua bank" : "Semua jabatan" : String(value)}
              onValueChange={(value) => setFilters((current) => ({ ...current, group: String(value) }))}
            >
              <Select.Option value="all">{activeTab === "treatments" ? "Semua kategori" : activeTab === "doctors" ? "Semua bank" : "Semua jabatan"}</Select.Option>
              {groupOptions.map((option) => (
                <Select.Option key={option} value={option}>{option}</Select.Option>
              ))}
            </Select>
            <Input
              aria-label="Nilai minimum"
              type="number"
              placeholder={activeTab === "doctors" ? "Fee min" : "Nilai min"}
              value={filters.minAmount}
              onChange={(event) => setFilters((current) => ({ ...current, minAmount: event.target.value }))}
            />
            <Input
              aria-label="Nilai maksimum"
              type="number"
              placeholder={activeTab === "doctors" ? "Fee max" : "Nilai max"}
              value={filters.maxAmount}
              onChange={(event) => setFilters((current) => ({ ...current, maxAmount: event.target.value }))}
            />
          </div>
        </div>

        {activeTab === "treatments" ? (
          <DataTable
            rows={filteredTreatments}
            columns={[
              { key: "code", header: "Kode", render: (row) => row.code ?? "-" },
              { key: "name", header: "Nama Treatment", render: (row) => row.name },
              { key: "category", header: "Kategori", render: (row) => row.category ?? "-" },
              { key: "doctor", header: "Jasa Dokter", align: "right", render: (row) => rupiah.format(row.doctor_cost) },
              { key: "bhp", header: "BHP", align: "right", render: (row) => rupiah.format(row.bhp_cost) },
              { key: "price", header: "Harga", align: "right", render: (row) => rupiah.format(row.treatment_price) },
              { key: "active", header: "Status", render: (row) => <Badge variant={row.is_active ? "success" : "secondary"}>{row.is_active ? "aktif" : "nonaktif"}</Badge> },
              { key: "actions", header: "Aksi", align: "right", render: (row) => actionButtons("treatments", row.id, row) },
            ]}
            pagination
            rowKey={(row) => row.id}
          />
        ) : null}

        {activeTab === "doctors" ? (
          <DataTable
            rows={filteredDoctors}
            columns={[
              { key: "name", header: "Nama", render: (row) => row.name },
              { key: "bank", header: "Bank", render: (row) => row.bank_name ?? "-" },
              { key: "account", header: "No Rekening", render: (row) => row.account_number ?? "-" },
              { key: "account_name", header: "Nama Rekening", render: (row) => row.account_name ?? "-" },
              { key: "nik", header: "NIK", render: (row) => row.nik ?? "-" },
              { key: "fee", header: "Fee", align: "right", render: (row) => `${(row.normal_fee_rate * 100).toFixed(0)}% / ${(row.ortho_fee_rate * 100).toFixed(0)}%` },
              { key: "tax", header: "Pajak", align: "right", render: (row) => `${(row.tax_rate * 100).toFixed(1)}%` },
              { key: "active", header: "Status", render: (row) => <Badge variant={row.is_active ? "success" : "secondary"}>{row.is_active ? "aktif" : "nonaktif"}</Badge> },
              { key: "actions", header: "Aksi", align: "right", render: (row) => actionButtons("doctors", row.id, row) },
            ]}
            pagination
            rowKey={(row) => row.id}
          />
        ) : null}

        {activeTab === "employees" ? (
          <DataTable
            rows={filteredEmployees}
            columns={[
              { key: "name", header: "Nama", render: (row) => row.name },
              { key: "position", header: "Jabatan", render: (row) => row.position ?? "-" },
              { key: "salary", header: "Gaji Pokok", align: "right", render: (row) => rupiah.format(row.base_salary) },
              { key: "days", header: "Hari Kerja", align: "right", render: (row) => row.working_days },
              { key: "bank", header: "Bank", render: (row) => row.bank_name ?? "-" },
              { key: "account", header: "No Rekening", render: (row) => row.account_number ?? "-" },
              { key: "active", header: "Status", render: (row) => <Badge variant={row.is_active ? "success" : "secondary"}>{row.is_active ? "aktif" : "nonaktif"}</Badge> },
              { key: "actions", header: "Aksi", align: "right", render: (row) => actionButtons("employees", row.id, row) },
            ]}
            pagination
            rowKey={(row) => row.id}
          />
        ) : null}
      </LayerCard>

      <Banner
        variant="secondary"
        icon={<Building2 size={20} />}
        description="Master data hanya menerima template khusus per tab. File transaksi fee dokter dan absensi tetap diimport dari halaman masing-masing."
      />

      <Dialog.Root open={editor.open} onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}>
        <Dialog size="lg" className="max-h-[90vh] overflow-auto p-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveRecord.mutate(editor);
            }}
          >
            <div className="border-b border-kumo-hairline p-5">
              <Dialog.Title>{editor.mode === "edit" ? "Edit" : "Tambah"} {MASTER_META[editor.target].label}</Dialog.Title>
              <Dialog.Description>Isi data master dengan value final yang dipakai untuk kalkulasi.</Dialog.Description>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-kumo-default">Nama</span>
                <Input required value={editor.values.name ?? ""} onChange={(event) => updateEditorValue("name", event.target.value)} />
              </label>

              {editor.target === "treatments" ? (
                <>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Kode</span>
                    <Input value={editor.values.code ?? ""} onChange={(event) => updateEditorValue("code", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Kategori</span>
                    <Input value={editor.values.category ?? ""} onChange={(event) => updateEditorValue("category", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Jasa Dokter</span>
                    <Input type="number" value={editor.values.doctor_cost ?? "0"} onChange={(event) => updateEditorValue("doctor_cost", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Jasa Spesialis</span>
                    <Input type="number" value={editor.values.specialist_cost ?? "0"} onChange={(event) => updateEditorValue("specialist_cost", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">BHP</span>
                    <Input type="number" value={editor.values.bhp_cost ?? "0"} onChange={(event) => updateEditorValue("bhp_cost", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Service Fee</span>
                    <Input type="number" value={editor.values.service_fee ?? "0"} onChange={(event) => updateEditorValue("service_fee", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Harga Treatment</span>
                    <Input type="number" value={editor.values.treatment_price ?? "0"} onChange={(event) => updateEditorValue("treatment_price", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Status</span>
                    <Select aria-label="Status treatment" value={editor.values.is_active} renderValue={(value) => value === "true" ? "Aktif" : "Nonaktif"} onValueChange={(value) => updateEditorValue("is_active", String(value))}>
                      <Select.Option value="true">Aktif</Select.Option>
                      <Select.Option value="false">Nonaktif</Select.Option>
                    </Select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm font-medium text-kumo-default">Catatan</span>
                    <Input value={editor.values.notes ?? ""} onChange={(event) => updateEditorValue("notes", event.target.value)} />
                  </label>
                </>
              ) : null}

              {editor.target === "doctors" ? (
                <>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Bank</span>
                    <Input value={editor.values.bank_name ?? ""} onChange={(event) => updateEditorValue("bank_name", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Nama Rekening</span>
                    <Input value={editor.values.account_name ?? ""} onChange={(event) => updateEditorValue("account_name", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">No Rekening</span>
                    <Input value={editor.values.account_number ?? ""} onChange={(event) => updateEditorValue("account_number", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">NIK</span>
                    <Input value={editor.values.nik ?? ""} onChange={(event) => updateEditorValue("nik", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Fee Normal</span>
                    <Input type="number" step="0.001" value={editor.values.normal_fee_rate ?? "0"} onChange={(event) => updateEditorValue("normal_fee_rate", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Fee Ortho</span>
                    <Input type="number" step="0.001" value={editor.values.ortho_fee_rate ?? "0"} onChange={(event) => updateEditorValue("ortho_fee_rate", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Pajak</span>
                    <Input type="number" step="0.001" value={editor.values.tax_rate ?? "0"} onChange={(event) => updateEditorValue("tax_rate", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Status</span>
                    <Select aria-label="Status dokter" value={editor.values.is_active} renderValue={(value) => value === "true" ? "Aktif" : "Nonaktif"} onValueChange={(value) => updateEditorValue("is_active", String(value))}>
                      <Select.Option value="true">Aktif</Select.Option>
                      <Select.Option value="false">Nonaktif</Select.Option>
                    </Select>
                  </label>
                </>
              ) : null}

              {editor.target === "employees" ? (
                <>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Jabatan</span>
                    <Input value={editor.values.position ?? ""} onChange={(event) => updateEditorValue("position", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Tanggal Masuk</span>
                    <Input type="date" value={editor.values.join_date ?? ""} onChange={(event) => updateEditorValue("join_date", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Gaji Pokok</span>
                    <Input type="number" value={editor.values.base_salary ?? "0"} onChange={(event) => updateEditorValue("base_salary", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Hari Kerja</span>
                    <Input type="number" value={editor.values.working_days ?? "25"} onChange={(event) => updateEditorValue("working_days", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Bank</span>
                    <Input value={editor.values.bank_name ?? ""} onChange={(event) => updateEditorValue("bank_name", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Nama Rekening</span>
                    <Input value={editor.values.account_name ?? ""} onChange={(event) => updateEditorValue("account_name", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">No Rekening</span>
                    <Input value={editor.values.account_number ?? ""} onChange={(event) => updateEditorValue("account_number", event.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-kumo-default">Status</span>
                    <Select aria-label="Status karyawan" value={editor.values.is_active} renderValue={(value) => value === "true" ? "Aktif" : "Nonaktif"} onValueChange={(value) => updateEditorValue("is_active", String(value))}>
                      <Select.Option value="true">Aktif</Select.Option>
                      <Select.Option value="false">Nonaktif</Select.Option>
                    </Select>
                  </label>
                </>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-kumo-hairline p-4">
              <Dialog.Close render={(props) => <Button {...props} variant="secondary" type="button">Batal</Button>} />
              <Button variant="primary" type="submit" loading={saveRecord.isPending} disabled={!editor.values.name?.trim()}>
                Simpan
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root open={importSession.open} onOpenChange={(open) => setImportSession((current) => ({ ...current, open }))}>
        <Dialog size="xl" className="max-h-[90vh] overflow-hidden p-0">
          <div className="border-b border-kumo-hairline p-5">
            <Dialog.Title>Preview Import {MASTER_META[importSession.target].label}</Dialog.Title>
            <Dialog.Description>
              {importSession.filename ?? "File Excel"} akan dicek sebelum mengubah master data.
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
              <Banner variant="error" icon={<AlertTriangle size={20} />} description={importSession.error} />
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
                  {summaryMetric("Invalid", preview.invalid_rows, preview.invalid_rows ? "danger" : "default")}
                  {summaryMetric("Baru", preview.summary.new ?? 0, "success")}
                  {summaryMetric("Update", preview.summary.update ?? 0, "warning")}
                  {summaryMetric("Duplikat file", preview.summary.duplicate_in_file ?? 0, preview.summary.duplicate_in_file ? "danger" : "default")}
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
                          <Table.Row key={`${row.row ?? index}-${row.name ?? index}`}>
                            <Table.Cell>{row.row ?? "-"}</Table.Cell>
                            <Table.Cell>{previewIdentity(importSession.target, row)}</Table.Cell>
                            <Table.Cell>{previewDetail(importSession.target, row)}</Table.Cell>
                            <Table.Cell>{statusBadge(row.status)}</Table.Cell>
                            <Table.Cell>{row.issues?.length ? row.issues.join(", ") : "-"}</Table.Cell>
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
                        <div key={`${error.row ?? index}-${error.message}`} className="rounded-md bg-kumo-base p-2">
                          Row {error.row ?? "-"} {error.field ? `(${error.field})` : ""}: {error.message}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-kumo-hairline p-4">
            <Dialog.Close render={(props) => <Button {...props} variant="secondary">Tutup</Button>} />
            <Button
              variant="primary"
              loading={commitImport.isPending}
              disabled={!hasCommitReady || commitImport.isPending}
              onClick={() => preview && commitImport.mutate({ target: importSession.target, importId: preview.import_id })}
            >
              Commit Import
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
