import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { MoreHorizontal, Pencil, PowerOff, RotateCcw, Trash2 } from "lucide-react";
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
        className="flex justify-end"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                aria-label={`Aksi ${MASTER_META.employees.label}`}
              >
                <MoreHorizontal size={16} />
              </Button>
            }
          />
          <DropdownMenu.Content>
            <DropdownMenu.Item icon={<Pencil className="mr-2" size={16} />} onClick={() => onEdit(row.id, row)}>
              Edit
            </DropdownMenu.Item>
            <DropdownMenu.Item
              icon={row.is_active ? <PowerOff className="mr-2" size={16} /> : <RotateCcw className="mr-2" size={16} />}
              disabled={isTogglePending}
              onClick={() => onToggleActive(row.id, !row.is_active)}
            >
              {row.is_active ? "Nonaktifkan" : "Aktifkan kembali"}
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              icon={<Trash2 className="mr-2" size={16} />}
              variant="danger"
              disabled={isDeletePending}
              onClick={() => onDelete(row.id, row.name)}
            >
              Hapus permanen
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
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
          header: "",
          align: "right",
          sticky: "right",
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
