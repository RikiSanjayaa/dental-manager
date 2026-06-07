import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Lock, Sheet } from "lucide-react";
import { useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { api, downloadFile, rupiah } from "../lib/api";

type Payroll = {
  id: number;
  employee_id: number;
  base_salary: number;
  double_shift_fee: number;
  sunday_fee: number;
  overtime_minutes: number;
  overtime_total: number;
  bonus: number;
  position_allowance: number;
  bpjs_deduction: number;
  other_deduction: number;
  pph21: number;
  net_salary: number;
  status: string;
};

export function PayrollPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["payroll", period], queryFn: () => api<Payroll[]>(`/payroll-periods/${period}/summary`) });
  const calculate = useMutation({
    mutationFn: () => api(`/payroll-periods/${period}/calculate`, { method: "POST" }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["payroll", period] }),
  });
  const lock = useMutation({
    mutationFn: () => api(`/payroll-periods/${period}/lock`, { method: "POST" }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["payroll", period] }),
  });

  return (
    <>
      <PageHeader
        title="Payroll"
        eyebrow="Gaji, lembur, pajak, slip"
        actions={
          <>
            <Input className="w-40" aria-label="Periode payroll" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
            <Button variant="secondary" icon={<Calculator size={18} />} loading={calculate.isPending} onClick={() => calculate.mutate()}>Calculate</Button>
            <Button variant="secondary" icon={<Lock size={18} />} loading={lock.isPending} onClick={() => lock.mutate()}>Lock</Button>
            <Button variant="secondary" icon={<Sheet size={18} />} onClick={() => downloadFile(`/reports/payroll?period=${period}&format=xlsx`, `payroll-${period}.xlsx`)}>XLSX</Button>
          </>
        }
      />
      <LayerCard className="p-4">
        <DataTable
          rows={data ?? []}
          columns={[
            { key: "employee", header: "Karyawan ID", render: (row) => row.employee_id },
            { key: "base", header: "Gaji Pokok", align: "right", render: (row) => rupiah.format(row.base_salary) },
            { key: "sunday", header: "Minggu", align: "right", render: (row) => rupiah.format(row.sunday_fee) },
            { key: "overtime", header: "Lembur", align: "right", render: (row) => `${row.overtime_minutes} m / ${rupiah.format(row.overtime_total)}` },
            { key: "allowance", header: "Tunjangan", align: "right", render: (row) => rupiah.format(row.position_allowance + row.bonus) },
            { key: "deduction", header: "Potongan", align: "right", render: (row) => rupiah.format(row.bpjs_deduction + row.other_deduction + row.pph21) },
            { key: "net", header: "Gaji Bersih", align: "right", render: (row) => <strong>{rupiah.format(row.net_salary)}</strong> },
            { key: "status", header: "Status", render: (row) => <Badge variant="success" appearance="dot">{row.status}</Badge> },
          ]}
        />
      </LayerCard>
    </>
  );
}
