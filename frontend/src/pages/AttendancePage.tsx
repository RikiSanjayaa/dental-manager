import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Breadcrumbs } from "@cloudflare/kumo/components/breadcrumbs";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileDown, FileUp, MoreHorizontal, Pencil, Plus, Search, Trash2, XCircle } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { AttendanceEditorDialog } from "../components/attendance/AttendanceEditorDialog";
import { AttendanceImportPreviewDialog } from "../components/attendance/AttendanceImportPreviewDialog";
import type { AttendancePreview, AttendanceRecord, EditorSession, Employee, ImportSession } from "../components/attendance/types";
import { attendancePayload, emptyAttendanceValues, includesText, valuesFromAttendance } from "../components/attendance/utils";
import { DataTable } from "../components/DataTable";
import { DatePickerPopover } from "../components/DatePickerPopover";
import { api } from "../lib/api";
import { brandName } from "../lib/brand";

function statusBadge(needsReview: boolean) {
  return needsReview ? <Badge variant="error">review</Badge> : <Badge variant="success">ok</Badge>;
}

function timeRange(start?: string | null, end?: string | null) {
  return `${start?.slice(0, 5) || "-"} / ${end?.slice(0, 5) || "-"}`;
}

function minuteValue(value: number, tone: "danger" | "info" | "success" | "default" = "default") {
  const toneClass =
    value === 0
      ? "text-kumo-subtle"
      : tone === "danger"
        ? "text-kumo-danger"
        : tone === "info"
          ? "text-kumo-info"
          : tone === "success"
            ? "text-kumo-success"
            : "text-kumo-default";
  return <span className={`font-medium ${toneClass}`}>{value} min</span>;
}

function attendanceStatus(row: AttendanceRecord) {
  const isDayOff = row.is_holiday;
  if (isDayOff && row.overtime_minutes > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-kumo-success">
        <CheckCircle2 size={16} /> Lembur
      </span>
    );
  }
  if (isDayOff) {
    return <span className="font-medium text-kumo-subtle">Libur</span>;
  }
  if (row.is_absent) {
    return (
    <span className="inline-flex items-center gap-1 font-medium text-kumo-danger">
      <XCircle size={16} /> Tidak hadir
    </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-medium text-kumo-success">
      <CheckCircle2 size={16} /> Hadir
    </span>
  );
}

function attendanceStatusKey(row: AttendanceRecord) {
  if (row.is_holiday && row.overtime_minutes > 0) return "overtime";
  if (row.is_holiday) return "holiday";
  if (row.is_absent) return "absent";
  return "present";
}

function isSunday(value: string) {
  return Boolean(value) && new Date(`${value}T00:00:00`).getDay() === 0;
}

type AttendanceHoliday = { id: number; holiday_date: string; name?: string | null; is_holiday: boolean };

export function AttendancePage() {
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editor, setEditor] = useState<EditorSession>({
    open: false,
    mode: "create",
    values: emptyAttendanceValues(period),
  });
  const [importSession, setImportSession] = useState<ImportSession>({ open: false });

  const { data: records } = useQuery({
    queryKey: ["attendance", period],
    queryFn: () => api<AttendanceRecord[]>(`/attendance-records?period=${period}`),
  });
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<Employee[]>("/employees"),
  });
  const { data: attendanceHolidays } = useQuery({
    queryKey: ["attendance-holidays"],
    queryFn: () => api<AttendanceHoliday[]>("/settings/attendance-holidays"),
  });

  const activeEmployees = useMemo(() => (employees ?? []).filter((employee) => employee.is_active), [employees]);
  const holidayByDate = useMemo(
    () => new Map((attendanceHolidays ?? []).map((item) => [item.holiday_date, item.is_holiday])),
    [attendanceHolidays],
  );

  function isHolidayDate(value: string) {
    return holidayByDate.get(value) ?? isSunday(value);
  }

  useEffect(() => {
    if (!editor.open || !editor.values.work_date) return;
    setEditor((current) => ({
      ...current,
      values: {
        ...current.values,
        is_holiday: isHolidayDate(current.values.work_date) ? "true" : "false",
      },
    }));
  }, [attendanceHolidays, editor.open]);

  const filteredRecords = useMemo(() => {
    return (records ?? []).filter((row) => {
      const matchesSearch =
        !search ||
        [row.attendance_id_snapshot, row.employee_name_snapshot, row.status_note].some((value) => includesText(value, search));
      const matchesEmployee = employeeFilter === "all" || String(row.employee_id) === employeeFilter;
      const matchesReview =
        reviewFilter === "all" ||
        (reviewFilter === "review" ? row.needs_review : !row.needs_review);
      const matchesAttendance = attendanceFilter === "all" || attendanceStatusKey(row) === attendanceFilter;
      const matchesDate = !dateFilter || row.work_date === dateFilter;
      return matchesSearch && matchesEmployee && matchesReview && matchesAttendance && matchesDate;
    });
  }, [attendanceFilter, dateFilter, employeeFilter, records, reviewFilter, search]);

  const saveAttendance = useMutation({
    mutationFn: (session: EditorSession) => {
      const path = session.mode === "edit" ? `/attendance-records/${session.id}` : "/attendance-records";
      return api<AttendanceRecord>(path, {
        method: session.mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(attendancePayload(session.values)),
      });
    },
    onSuccess: async (_, session) => {
      toasts.add({ title: session.mode === "edit" ? "Absensi diperbarui" : "Absensi ditambahkan", variant: "success" });
      setEditor((current) => ({ ...current, open: false }));
      await queryClient.invalidateQueries({ queryKey: ["attendance", period] });
    },
    onError: (error) =>
      toasts.add({
        title: "Absensi gagal disimpan",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const deleteAttendance = useMutation({
    mutationFn: (id: number) => api(`/attendance-records/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toasts.add({ title: "Absensi dihapus", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["attendance", period] });
    },
    onError: (error) =>
      toasts.add({
        title: "Absensi gagal dihapus",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const deleteSelectedAttendance = useMutation({
    mutationFn: async (ids: number[]) =>
      Promise.all(ids.map((id) => api(`/attendance-records/${id}`, { method: "DELETE" }))),
    onSuccess: async (_, ids) => {
      toasts.add({ title: `${ids.length} absensi dihapus`, variant: "success" });
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["attendance", period] });
    },
    onError: (error) =>
      toasts.add({
        title: "Absensi terpilih gagal dihapus",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const markReview = useMutation({
    mutationFn: ({ row, needsReview }: { row: AttendanceRecord; needsReview: boolean }) =>
      api<AttendanceRecord>(`/attendance-records/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...attendancePayload(valuesFromAttendance(row)), needs_review: needsReview }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance", period] });
    },
  });

  const previewImport = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api<AttendancePreview>("/attendance/import-preview", { method: "POST", body: form });
    },
    onSuccess: (preview, file) => {
      setImportSession({ open: true, file, filename: file.name, preview });
    },
    onError: (error, file) => {
      setImportSession({ open: true, file, filename: file.name, error: error instanceof Error ? error.message : "Preview import gagal." });
    },
  });

  const commitImport = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return api<{ created: number; updated: number; invalid_rows: number }>("/attendance/import", { method: "POST", body: form });
    },
    onSuccess: async (result) => {
      toasts.add({ title: "Import absensi selesai", description: `${result.created} dibuat, ${result.updated} diperbarui.`, variant: "success" });
      setImportSession((current) => ({ ...current, committed: result }));
      await queryClient.invalidateQueries({ queryKey: ["attendance", period] });
    },
    onError: (error) =>
      setImportSession((current) => ({ ...current, error: error instanceof Error ? error.message : "Commit import gagal." })),
  });

  function openCreate() {
    const values = emptyAttendanceValues(period);
    values.is_holiday = isHolidayDate(values.work_date) ? "true" : "false";
    setEditor({ open: true, mode: "create", values });
  }

  function openEdit(row: AttendanceRecord) {
    setEditor({ open: true, mode: "edit", id: row.id, values: valuesFromAttendance(row) });
  }

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) previewImport.mutate(file);
    event.target.value = "";
  }

  function toggleRow(row: AttendanceRecord, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
  }

  function togglePage(rows: AttendanceRecord[], selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => {
        if (selected) next.add(row.id);
        else next.delete(row.id);
      });
      return next;
    });
  }

  function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (confirm(`Hapus ${ids.length} absensi terpilih?`)) deleteSelectedAttendance.mutate(ids);
  }

  return (
    <>
      <div className="border-b border-kumo-line">
        <Breadcrumbs size="sm">
          <Breadcrumbs.Link href="/">{brandName}</Breadcrumbs.Link>
          <Breadcrumbs.Separator />
          <Breadcrumbs.Current>Absensi</Breadcrumbs.Current>
        </Breadcrumbs>
      </div>

      <div className="flex items-start justify-between gap-4 py-3">
        <div>
          <h1 className="text-2xl font-semibold">Absensi</h1>
          <p className="mt-1 text-sm text-gray-600">Data fingerprint karyawan sebagai dasar payroll bulanan</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input className="w-40" aria-label="Periode absensi" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          <LinkButton variant="secondary" href="/api/reports/templates/attendance.xlsx" download="attendance-template.xlsx" icon={<FileDown size={18} />}>
            Format Import
          </LinkButton>
          <Button variant="secondary" icon={<Plus size={18} />} onClick={openCreate}>
            Tambah Absensi
          </Button>
          <Button variant="primary" icon={<FileUp size={18} />} onClick={() => fileInputRef.current?.click()}>
            Import
          </Button>
          <input ref={fileInputRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={onImport} />
        </div>
      </div>

      <Banner
        variant="secondary"
        description="Kolom terlambat, pulang awal, absen, dan total dihitung otomatis dari aturan absensi default di backend."
      />

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Text as="h2" variant="heading3">Data Absensi</Text>
              <p className="mt-1 text-sm text-kumo-subtle">
                {filteredRecords.length} absensi ditampilkan untuk periode {period}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-72 flex-1 items-center gap-2">
              <Search size={16} className="text-kumo-subtle" />
              <Input
                className="flex-1"
                aria-label="Cari absensi"
                placeholder="Cari nama, ID absensi, atau catatan..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              className="w-52"
              aria-label="Filter karyawan"
              value={employeeFilter}
              renderValue={(value) => value === "all" ? "Semua karyawan" : activeEmployees.find((employee) => String(employee.id) === value)?.name ?? "Karyawan"}
              onValueChange={(value) => setEmployeeFilter(String(value))}
            >
              <Select.Option value="all">Semua karyawan</Select.Option>
              {activeEmployees.map((employee) => (
                <Select.Option key={employee.id} value={String(employee.id)}>
                  {employee.name}
                </Select.Option>
              ))}
            </Select>
            <Select
              className="w-40"
              aria-label="Filter status review"
              value={reviewFilter}
              renderValue={(value) => value === "review" ? "Perlu review" : value === "ok" ? "OK" : "Semua status"}
              onValueChange={(value) => setReviewFilter(String(value))}
            >
              <Select.Option value="all">Semua status</Select.Option>
              <Select.Option value="ok">OK</Select.Option>
              <Select.Option value="review">Perlu review</Select.Option>
            </Select>
            <Select
              className="w-40"
              aria-label="Filter status hadir"
              value={attendanceFilter}
              renderValue={(value) =>
                value === "present" ? "Hadir" :
                value === "absent" ? "Tidak hadir" :
                value === "holiday" ? "Libur" :
                value === "overtime" ? "Lembur" :
                "Semua hadir"
              }
              onValueChange={(value) => setAttendanceFilter(String(value))}
            >
              <Select.Option value="all">Semua hadir</Select.Option>
              <Select.Option value="present">Hadir</Select.Option>
              <Select.Option value="absent">Tidak hadir</Select.Option>
              <Select.Option value="holiday">Libur</Select.Option>
              <Select.Option value="overtime">Lembur</Select.Option>
            </Select>
            <div className="w-40">
              <DatePickerPopover
                value={dateFilter}
                onChange={setDateFilter}
                placeholder="Filter tanggal"
              />
            </div>
            {selectedIds.size ? (
              <Button
                variant="secondary-destructive"
                icon={<Trash2 size={16} />}
                loading={deleteSelectedAttendance.isPending}
                onClick={deleteSelected}
              >
                Hapus {selectedIds.size}
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          rows={filteredRecords}
          pagination
          pageSize={25}
          minTableWidth={1180}
          selectable
          selectedKeys={selectedIds}
          onToggleRow={(row, selected) => toggleRow(row, selected)}
          onTogglePage={(rows, selected) => togglePage(rows, selected)}
          rowKey={(row) => row.id}
          empty="Belum ada data absensi untuk periode ini."
          columns={[
            { key: "date", header: "Tanggal", sticky: "left", render: (row) => row.work_date },
            { key: "name", header: "Nama", render: (row) => row.employee_name_snapshot },
            { key: "tz1", header: "Timezone I", render: (row) => timeRange(row.timezone1_in, row.timezone1_out) },
            { key: "tz2", header: "Timezone II", render: (row) => timeRange(row.timezone2_in, row.timezone2_out) },
            { key: "late", header: "Terlambat", align: "right", render: (row) => minuteValue(row.late_minutes, "danger") },
            { key: "early", header: "Pulang Awal", align: "right", render: (row) => minuteValue(row.early_leave_minutes, "danger") },
            { key: "absent", header: "Status Hadir", align: "center", render: (row) => attendanceStatus(row) },
            { key: "total", header: "Total", align: "right", render: (row) => minuteValue(row.total_minutes, "info") },
            { key: "overtime", header: "Lembur", align: "right", render: (row) => minuteValue(row.overtime_minutes, "success") },
            { key: "status", header: "Status", render: (row) => statusBadge(row.needs_review) },
            { key: "note", header: "Catatan", render: (row) => row.status_note ?? "-" },
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
                        <Button variant="ghost" size="sm" shape="square" aria-label="Aksi absensi">
                          <MoreHorizontal size={16} />
                        </Button>
                      }
                    />
                    <DropdownMenu.Content>
                      <DropdownMenu.Item icon={<Pencil className="mr-2" size={16} />} onClick={() => openEdit(row)}>
                        Edit
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        icon={<CheckCircle2 className="mr-2" size={16} />}
                        onClick={() => markReview.mutate({ row, needsReview: !row.needs_review })}
                      >
                        {row.needs_review ? "Tandai OK" : "Tandai review"}
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        icon={<Trash2 className="mr-2" size={16} />}
                        variant="danger"
                        disabled={deleteAttendance.isPending}
                        onClick={() => {
                          if (confirm(`Hapus absensi ${row.employee_name_snapshot} ${row.work_date}?`)) deleteAttendance.mutate(row.id);
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

      <AttendanceEditorDialog
        editor={editor}
        employees={activeEmployees}
        isSaving={saveAttendance.isPending}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onFieldChange={(field, value) => setEditor((current) => {
          const values = { ...current.values, [field]: value };
          if (field === "work_date") values.is_holiday = isHolidayDate(value) ? "true" : "false";
          return { ...current, values };
        })}
        onSubmit={() => saveAttendance.mutate(editor)}
      />

      <AttendanceImportPreviewDialog
        session={importSession}
        isPreviewPending={previewImport.isPending}
        isCommitting={commitImport.isPending}
        hasCommitReady={Boolean(importSession.file && importSession.preview && importSession.preview.valid_rows > 0 && !importSession.committed)}
        onOpenChange={(open) => setImportSession((current) => ({ ...current, open }))}
        onCommit={() => importSession.file ? commitImport.mutate(importSession.file) : null}
      />
    </>
  );
}
