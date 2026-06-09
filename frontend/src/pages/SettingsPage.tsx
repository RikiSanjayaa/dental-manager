import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Field } from "@cloudflare/kumo/components/field";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCcw } from "lucide-react";
import { useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { isDevelopmentEnvironment } from "../lib/environment";

type PayrollRule = { id: number; name: string; is_default: boolean; bpjs_jht_rate: number; overtime_rate_per_minute: number; pph21_threshold: number; pph21_rate: number };
type DoctorFeeRule = { id: number; name: string; is_default: boolean; normal_fee_rate: number; ortho_fee_rate: number; tax_rate: number; default_deduction: number };
type AttendanceRule = { id: number; name: string; is_default: boolean; timezone1_start: string; timezone1_end: string; timezone2_start: string; timezone2_end: string };

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [attendanceEditor, setAttendanceEditor] = useState<{
    open: boolean;
    rule?: AttendanceRule;
    values: { name: string; timezone1_start: string; timezone1_end: string; timezone2_start: string; timezone2_end: string };
  }>({
    open: false,
    values: { name: "", timezone1_start: "08:00", timezone1_end: "16:00", timezone2_start: "14:00", timezone2_end: "21:00" },
  });
  const { data: payrollRules } = useQuery({ queryKey: ["payroll-rules"], queryFn: () => api<PayrollRule[]>("/settings/payroll-rules") });
  const { data: attendanceRules } = useQuery({ queryKey: ["attendance-rules"], queryFn: () => api<AttendanceRule[]>("/settings/attendance-rules") });
  const { data: doctorRules } = useQuery({ queryKey: ["doctor-fee-rules"], queryFn: () => api<DoctorFeeRule[]>("/settings/doctor-fee-rules") });
  const refreshDatabase = useMutation({
    mutationFn: () => api<{ status: string; message: string }>("/dev/refresh-database", { method: "POST" }),
    onSuccess: async (result) => {
      setRefreshMessage(result.message);
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      setRefreshMessage(error instanceof Error ? error.message : "Refresh database gagal.");
    },
  });
  const saveAttendanceRule = useMutation({
    mutationFn: () =>
      api<AttendanceRule>(`/settings/attendance-rules/${attendanceEditor.rule?.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: attendanceEditor.values.name,
          is_default: attendanceEditor.rule?.is_default ?? true,
          timezone1_start: attendanceEditor.values.timezone1_start,
          timezone1_end: attendanceEditor.values.timezone1_end,
          timezone2_start: attendanceEditor.values.timezone2_start,
          timezone2_end: attendanceEditor.values.timezone2_end,
        }),
      }),
    onSuccess: async () => {
      setAttendanceEditor((current) => ({ ...current, open: false }));
      await queryClient.invalidateQueries({ queryKey: ["attendance-rules"] });
    },
  });

  function confirmRefresh() {
    const ok = window.confirm("Refresh database akan menghapus semua data app dan seed ulang admin/default rules. Lanjutkan?");
    if (ok) refreshDatabase.mutate();
  }

  function openAttendanceRule(rule: AttendanceRule) {
    setAttendanceEditor({
      open: true,
      rule,
      values: {
        name: rule.name,
        timezone1_start: rule.timezone1_start.slice(0, 5),
        timezone1_end: rule.timezone1_end.slice(0, 5),
        timezone2_start: rule.timezone2_start.slice(0, 5),
        timezone2_end: rule.timezone2_end.slice(0, 5),
      },
    });
  }

  function setAttendanceRuleValue(field: keyof typeof attendanceEditor.values, value: string) {
    setAttendanceEditor((current) => ({ ...current, values: { ...current.values, [field]: value } }));
  }

  return (
    <>
      <PageHeader title="Settings" eyebrow="Configurable calculation rules" />
      {isDevelopmentEnvironment ? (
        <LayerCard className="flex items-center justify-between gap-4 border-kumo-danger p-4">
          <div>
            <Text as="h2" variant="heading3">Testing Tools</Text>
            <Text variant="secondary" size="sm">Refresh database menghapus semua data app, lalu membuat ulang admin dan default rules.</Text>
            {refreshMessage ? <Text variant="error" size="sm">{refreshMessage}</Text> : null}
          </div>
          <Button
            variant="secondary-destructive"
            icon={<RefreshCcw size={18} />}
            loading={refreshDatabase.isPending}
            onClick={confirmRefresh}
          >
            Refresh Database
          </Button>
        </LayerCard>
      ) : null}
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">Payroll Rules</Text>
        <DataTable
          rows={payrollRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            { key: "default", header: "Default", render: (row) => <Badge variant={row.is_default ? "success" : "secondary"}>{row.is_default ? "yes" : "no"}</Badge> },
            { key: "bpjs", header: "BPJS", align: "right", render: (row) => `${(row.bpjs_jht_rate * 100).toFixed(1)}%` },
            { key: "overtime", header: "Lembur / menit", align: "right", render: (row) => row.overtime_rate_per_minute },
            { key: "pph", header: "PPh 21", align: "right", render: (row) => `${(row.pph21_rate * 100).toFixed(1)}%` },
          ]}
        />
      </LayerCard>
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">Attendance Rules</Text>
        <DataTable
          rows={attendanceRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            { key: "default", header: "Default", render: (row) => <Badge variant={row.is_default ? "success" : "secondary"}>{row.is_default ? "yes" : "no"}</Badge> },
            { key: "tz1", header: "Timezone I", render: (row) => `${row.timezone1_start.slice(0, 5)} - ${row.timezone1_end.slice(0, 5)}` },
            { key: "tz2", header: "Timezone II", render: (row) => `${row.timezone2_start.slice(0, 5)} - ${row.timezone2_end.slice(0, 5)}` },
            {
              key: "actions",
              header: "",
              align: "right",
              sticky: "right",
              render: (row) => (
                <Button size="sm" variant="secondary" icon={<Pencil size={16} />} onClick={() => openAttendanceRule(row)}>
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </LayerCard>
      <LayerCard className="p-4">
        <Text as="h2" variant="heading3" DANGEROUS_className="mb-4">Doctor Fee Rules</Text>
        <DataTable
          rows={doctorRules ?? []}
          columns={[
            { key: "name", header: "Nama", render: (row) => row.name },
            { key: "default", header: "Default", render: (row) => <Badge variant={row.is_default ? "success" : "secondary"}>{row.is_default ? "yes" : "no"}</Badge> },
            { key: "normal", header: "Normal", align: "right", render: (row) => `${(row.normal_fee_rate * 100).toFixed(0)}%` },
            { key: "ortho", header: "Ortho", align: "right", render: (row) => `${(row.ortho_fee_rate * 100).toFixed(0)}%` },
            { key: "tax", header: "Pajak", align: "right", render: (row) => `${(row.tax_rate * 100).toFixed(1)}%` },
          ]}
        />
      </LayerCard>

      <Dialog.Root open={attendanceEditor.open} onOpenChange={(open) => setAttendanceEditor((current) => ({ ...current, open }))}>
        <Dialog size="lg" className="p-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveAttendanceRule.mutate();
            }}
          >
            <div className="border-b border-kumo-hairline px-6 py-4">
              <Dialog.Title className="text-lg font-bold">Edit Attendance Rule</Dialog.Title>
              <Dialog.Description>Atur jam default untuk kalkulasi terlambat, pulang awal, absen, dan lembur.</Dialog.Description>
            </div>
            <div className="grid gap-3 px-6 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Nama Rule">
                  <Input value={attendanceEditor.values.name} onChange={(event) => setAttendanceRuleValue("name", event.target.value)} />
                </Field>
              </div>
              <Field label="Timezone I Mulai">
                <Input type="time" value={attendanceEditor.values.timezone1_start} onChange={(event) => setAttendanceRuleValue("timezone1_start", event.target.value)} />
              </Field>
              <Field label="Timezone I Selesai">
                <Input type="time" value={attendanceEditor.values.timezone1_end} onChange={(event) => setAttendanceRuleValue("timezone1_end", event.target.value)} />
              </Field>
              <Field label="Timezone II Mulai">
                <Input type="time" value={attendanceEditor.values.timezone2_start} onChange={(event) => setAttendanceRuleValue("timezone2_start", event.target.value)} />
              </Field>
              <Field label="Timezone II Selesai">
                <Input type="time" value={attendanceEditor.values.timezone2_end} onChange={(event) => setAttendanceRuleValue("timezone2_end", event.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
              <Dialog.Close render={(props) => <Button {...props} variant="secondary" type="button">Batal</Button>} />
              <Button variant="primary" type="submit" loading={saveAttendanceRule.isPending}>Simpan</Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
