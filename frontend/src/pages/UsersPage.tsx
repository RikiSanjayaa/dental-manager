import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Field } from "@cloudflare/kumo/components/field";
import { Grid } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Text } from "@cloudflare/kumo/components/text";
import { useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Save, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "../components/DataTable";
import type { Doctor } from "../components/treatment-history/types";
import { api, type Role } from "../lib/api";
import { roleLabel } from "../lib/auth";

type EmployeeOption = {
  id: number;
  name: string;
  is_active: boolean;
};

type UserRow = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  employee_id?: number | null;
  employee_name?: string | null;
  doctor_id?: number | null;
  doctor_name?: string | null;
  is_active: boolean;
};

type UserDraft = {
  username: string;
  full_name: string;
  password: string;
  role: Role;
  employee_id: string;
  doctor_id: string;
  is_active: boolean;
};

const emptyDraft: UserDraft = {
  username: "",
  full_name: "",
  password: "",
  role: "operator",
  employee_id: "none",
  doctor_id: "none",
  is_active: true,
};

function roleBadge(role: Role) {
  return <Badge variant={role === "admin" ? "info" : "secondary"}>{roleLabel(role)}</Badge>;
}

const ROLES: Role[] = ["operator", "admin", "doctor"];

function roleOptions() {
  return ROLES.map((role) => (
    <Select.Option key={role} value={role}>
      {roleLabel(role)}
    </Select.Option>
  ));
}

function includesText(value: unknown, query: string) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const toasts = useKumoToastManager();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<number, UserDraft>>({});

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<UserRow[]>("/users"),
  });
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<EmployeeOption[]>("/employees"),
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => api<Doctor[]>("/doctors"),
  });

  const activeEmployees = useMemo(() => (employees ?? []).filter((employee) => employee.is_active), [employees]);
  const activeDoctors = useMemo(() => (doctors ?? []).filter((doctor) => doctor.is_active), [doctors]);

  const filteredUsers = useMemo(
    () =>
      (users ?? []).filter((user) =>
        [user.username, user.full_name, user.role, user.employee_name, user.doctor_name].some((value) => includesText(value, search)),
      ),
    [search, users],
  );

  const createUser = useMutation({
    mutationFn: (payload: UserDraft) =>
      api<UserRow>("/users", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          employee_id: payload.role === "doctor" || payload.employee_id === "none" ? null : Number(payload.employee_id),
          doctor_id: payload.role === "doctor" ? Number(payload.doctor_id) : null,
        }),
      }),
    onSuccess: async () => {
      toasts.add({ title: "User ditambahkan", variant: "success" });
      setDraft(emptyDraft);
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) =>
      toasts.add({
        title: "User gagal ditambahkan",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserDraft }) =>
      api<UserRow>(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: payload.full_name,
          role: payload.role,
          employee_id: payload.role === "doctor" || payload.employee_id === "none" ? null : Number(payload.employee_id),
          doctor_id: payload.role === "doctor" ? (payload.doctor_id === "none" ? null : Number(payload.doctor_id)) : null,
          is_active: payload.is_active,
          ...(payload.password ? { password: payload.password } : {}),
        }),
      }),
    onSuccess: async (_, variables) => {
      toasts.add({ title: "User diperbarui", variant: "success" });
      setEditDrafts((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) =>
      toasts.add({
        title: "User gagal diperbarui",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });

  function draftFor(row: UserRow) {
    return (
      editDrafts[row.id] ?? {
        username: row.username,
        full_name: row.full_name,
        password: "",
        role: row.role,
        employee_id: row.employee_id ? String(row.employee_id) : "none",
        doctor_id: row.doctor_id ? String(row.doctor_id) : "none",
        is_active: row.is_active,
      }
    );
  }

  function updateEditDraft(id: number, patch: Partial<UserDraft>) {
    const row = users?.find((item) => item.id === id);
    if (!row) return;
    setEditDrafts((current) => ({
      ...current,
      [id]: { ...draftFor(row), ...patch },
    }));
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="mt-1 text-sm text-gray-600">Kelola akses admin, operator, dan dokter.</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => {
            setDraft(emptyDraft);
            setCreateOpen(true);
          }}
        >
          Tambah User
        </Button>
      </div>

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog
          size="lg"
          className="user-create-dialog p-0"
          style={{ width: "min(512px, calc(100vw - 24px))", maxHeight: "95vh", overflow: "hidden" }}
        >
          <form
            className="flex max-h-[95vh] min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              createUser.mutate(draft);
            }}
          >
            <div className="border-b border-kumo-hairline px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-lg font-bold">Tambah User</Dialog.Title>
                  <Dialog.Description>
                    Akun dokter wajib terhubung ke satu dokter master; dokter hanya melihat data fee dan riwayat perawatannya sendiri.
                  </Dialog.Description>
                </div>
                {roleBadge(draft.role)}
              </div>
            </div>

            <div className="px-6 py-4" style={{ minHeight: 0, flex: "1 1 0%", overflow: "auto" }}>
              <Grid variant="2up" gap="sm">
                <Field label="Username">
                  <Input
                    value={draft.username}
                    required
                    autoFocus
                    onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
                  />
                </Field>
                <Field label="Nama Lengkap">
                  <Input
                    value={draft.full_name}
                    required
                    onChange={(event) => setDraft((current) => ({ ...current, full_name: event.target.value }))}
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    value={draft.password}
                    required
                    onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
                  />
                </Field>
                <Field label="Role">
                  <Select
                    value={draft.role}
                    renderValue={(value) => roleLabel(value as Role)}
                    onValueChange={(value) => setDraft((current) => ({ ...current, role: value as Role }))}
                  >
                    {roleOptions()}
                  </Select>
                </Field>
                {draft.role === "doctor" ? (
                  <Field label="Dokter Terhubung">
                    <Select
                      value={draft.doctor_id}
                      renderValue={(value) =>
                        value === "none" ? "Pilih dokter" : activeDoctors.find((doctor) => String(doctor.id) === value)?.name ?? "Dokter"
                      }
                      onValueChange={(value) => setDraft((current) => ({ ...current, doctor_id: String(value) }))}
                    >
                      <Select.Option value="none">Pilih dokter</Select.Option>
                      {activeDoctors.map((doctor) => (
                        <Select.Option key={doctor.id} value={String(doctor.id)}>
                          {doctor.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Karyawan Terhubung">
                    <Select
                      value={draft.employee_id}
                      renderValue={(value) => value === "none" ? "Tidak terhubung" : activeEmployees.find((employee) => String(employee.id) === value)?.name ?? "Karyawan"}
                      onValueChange={(value) => setDraft((current) => ({ ...current, employee_id: String(value) }))}
                    >
                      <Select.Option value="none">Tidak terhubung</Select.Option>
                      {activeEmployees.map((employee) => (
                        <Select.Option key={employee.id} value={String(employee.id)}>
                          {employee.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Switch
                    size="sm"
                    variant="neutral"
                    label="User aktif"
                    checked={draft.is_active}
                    onCheckedChange={(checked) => setDraft((current) => ({ ...current, is_active: checked }))}
                  />
                </div>
              </Grid>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
              <Badge variant={draft.is_active ? "success" : "secondary"}>
                {draft.is_active ? "Aktif" : "Nonaktif"}
              </Badge>
              <div className="flex justify-end gap-2">
                <Dialog.Close render={(props) => <Button {...props} variant="secondary" type="button">Batal</Button>} />
                <Button
                  type="submit"
                  variant="primary"
                  icon={<Plus size={18} />}
                  loading={createUser.isPending}
                  disabled={!draft.username.trim() || !draft.full_name.trim() || !draft.password.trim() || (draft.role === "doctor" && draft.doctor_id === "none")}
                >
                  Tambah User
                </Button>
              </div>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text as="h2" variant="heading3">Daftar User</Text>
            <p className="mt-1 text-sm text-kumo-subtle">{filteredUsers.length} user ditampilkan.</p>
          </div>
          <div className="flex min-w-72 items-center gap-2">
            <Search size={16} className="text-kumo-subtle" />
            <Input aria-label="Cari user" placeholder="Cari username, nama, role, atau dokter..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        <DataTable
          rows={filteredUsers}
          pagination
          pageSize={25}
          minTableWidth={1260}
          rowKey={(row) => row.id}
          columns={[
            { key: "username", header: "Username", render: (row) => row.username },
            {
              key: "name",
              header: "Nama Lengkap",
              render: (row) => (
                <Input
                  value={draftFor(row).full_name}
                  onChange={(event) => updateEditDraft(row.id, { full_name: event.target.value })}
                />
              ),
            },
            {
              key: "role",
              header: "Role",
              render: (row) => (
                <Select
                  value={draftFor(row).role}
                  renderValue={(value) => roleLabel(value as Role)}
                  onValueChange={(value) => updateEditDraft(row.id, { role: value as Role })}
                >
                  {roleOptions()}
                </Select>
              ),
            },
            {
              key: "employee",
              header: "Karyawan Terhubung",
              render: (row) =>
                draftFor(row).role === "doctor" ? (
                  <span className="text-kumo-subtle">-</span>
                ) : (
                  <Select
                    value={draftFor(row).employee_id}
                    renderValue={(value) => value === "none" ? "Tidak terhubung" : activeEmployees.find((employee) => String(employee.id) === value)?.name ?? row.employee_name ?? "Karyawan"}
                    onValueChange={(value) => updateEditDraft(row.id, { employee_id: String(value) })}
                  >
                    <Select.Option value="none">Tidak terhubung</Select.Option>
                    {activeEmployees.map((employee) => (
                      <Select.Option key={employee.id} value={String(employee.id)}>
                        {employee.name}
                      </Select.Option>
                    ))}
                  </Select>
                ),
            },
            {
              key: "doctor",
              header: "Dokter Terhubung",
              render: (row) =>
                draftFor(row).role === "doctor" ? (
                  <Select
                    value={draftFor(row).doctor_id}
                    renderValue={(value) =>
                      value === "none" ? "Pilih dokter" : activeDoctors.find((doctor) => String(doctor.id) === value)?.name ?? row.doctor_name ?? "Dokter"
                    }
                    onValueChange={(value) => updateEditDraft(row.id, { doctor_id: String(value) })}
                  >
                    <Select.Option value="none">Pilih dokter</Select.Option>
                    {activeDoctors.map((doctor) => (
                      <Select.Option key={doctor.id} value={String(doctor.id)}>
                        {doctor.name}
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-kumo-subtle">{row.doctor_name ?? "-"}</span>
                ),
            },
            {
              key: "password",
              header: "Password Baru",
              render: (row) => (
                <Input
                  type="password"
                  placeholder="Kosongkan jika tetap"
                  value={draftFor(row).password}
                  onChange={(event) => updateEditDraft(row.id, { password: event.target.value })}
                />
              ),
            },
            { key: "status", header: "Role Saat Ini", render: (row) => roleBadge(row.role) },
            {
              key: "active",
              header: "Status",
              render: (row) => (
                <Switch
                  size="sm"
                  variant="neutral"
                  label={draftFor(row).is_active ? "Aktif" : "Nonaktif"}
                  checked={draftFor(row).is_active}
                  onCheckedChange={(checked) => updateEditDraft(row.id, { is_active: checked })}
                />
              ),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              sticky: "right",
              render: (row) => (
                <Button
                  size="sm"
                  variant="primary"
                  icon={draftFor(row).password ? <KeyRound size={16} /> : <Save size={16} />}
                  loading={updateUser.isPending}
                  onClick={() => updateUser.mutate({ id: row.id, payload: draftFor(row) })}
                >
                  Simpan
                </Button>
              ),
            },
          ]}
        />
      </LayerCard>
    </>
  );
}
