import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Pencil, PowerOff, RotateCcw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { DataTable } from "../DataTable";
import { rupiah } from "../../lib/api";
import { MASTER_META } from "./constants";
import type { Employee } from "./types";

type Props = {
  rows: Employee[];
  selectedKeys: Set<number>;
  isTogglePending: boolean;
  isDeletePending: boolean;
  onEdit: (id: number, row: Employee) => void;
  onToggleActive: (id: number, active: boolean) => void;
  onDelete: (id: number, name: string) => void;
  onToggleRow: (row: Employee, selected: boolean) => void;
  onTogglePage: (rows: Employee[], selected: boolean) => void;
};

export function EmployeeTable({
  rows,
  selectedKeys,
  isTogglePending,
  isDeletePending,
  onEdit,
  onToggleActive,
  onDelete,
  onToggleRow,
  onTogglePage,
}: Props) {
  function actionButtons(row: Employee): ReactNode {
    return (
      <div
        className="flex justify-end gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="secondary"
          shape="square"
          aria-label={`Edit ${MASTER_META.employees.label}`}
          title="Edit"
          icon={<Pencil size={16} />}
          onClick={() => onEdit(row.id, row)}
        />
        <Button
          variant="secondary"
          shape="square"
          aria-label={`${row.is_active ? "Nonaktifkan" : "Aktifkan"} ${MASTER_META.employees.label}`}
          title={row.is_active ? "Nonaktifkan" : "Aktifkan kembali"}
          icon={row.is_active ? <PowerOff size={16} /> : <RotateCcw size={16} />}
          loading={isTogglePending}
          onClick={() => onToggleActive(row.id, !row.is_active)}
        />
        <Button
          variant="secondary-destructive"
          shape="square"
          aria-label={`Hapus permanen ${MASTER_META.employees.label}`}
          title="Hapus permanen"
          icon={<Trash2 size={16} />}
          loading={isDeletePending}
          onClick={() => onDelete(row.id, row.name)}
        />
      </div>
    );
  }

  return (
    <DataTable
      rows={rows}
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
          render: (row) => actionButtons(row),
        },
      ]}
      pagination
      rowKey={(row) => row.id}
      selectable
      selectedKeys={selectedKeys}
      onToggleRow={(row, selected) => onToggleRow(row, selected)}
      onTogglePage={(rows, selected) => onTogglePage(rows, selected)}
    />
  );
}
