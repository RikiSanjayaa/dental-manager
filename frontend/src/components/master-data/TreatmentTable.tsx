import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { MoreHorizontal, Pencil, PowerOff, RotateCcw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { DataTable } from "../DataTable";
import { rupiah } from "../../lib/api";
import { MASTER_META } from "./constants";
import type { Treatment } from "./types";

type Props = {
  rows: Treatment[];
  selectedKeys: Set<number>;
  isTogglePending: boolean;
  isDeletePending: boolean;
  onEdit: (id: number, row: Treatment) => void;
  onToggleActive: (id: number, active: boolean) => void;
  onDelete: (id: number, name: string) => void;
  onToggleRow: (row: Treatment, selected: boolean) => void;
  onTogglePage: (rows: Treatment[], selected: boolean) => void;
};

export function TreatmentTable({
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
  function actionButtons(row: Treatment): ReactNode {
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
                aria-label={`Aksi ${MASTER_META.treatments.label}`}
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
        { key: "code", header: "Kode", render: (row) => row.code ?? "-" },
        { key: "name", header: "Nama Treatment", render: (row) => row.name },
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
