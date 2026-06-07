import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { MoreHorizontal, Pencil, PowerOff, RotateCcw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { DataTable } from "../DataTable";
import { MASTER_META } from "./constants";
import type { Doctor } from "./types";

type Props = {
  rows: Doctor[];
  selectedKeys: Set<number>;
  isTogglePending: boolean;
  isDeletePending: boolean;
  onEdit: (id: number, row: Doctor) => void;
  onToggleActive: (id: number, active: boolean) => void;
  onDelete: (id: number, name: string) => void;
  onToggleRow: (row: Doctor, selected: boolean) => void;
  onTogglePage: (rows: Doctor[], selected: boolean) => void;
};

export function DoctorTable({
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
  function actionButtons(row: Doctor): ReactNode {
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
                aria-label={`Aksi ${MASTER_META.doctors.label}`}
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
