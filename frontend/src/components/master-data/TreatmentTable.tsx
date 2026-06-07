import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Pencil, PowerOff, RotateCcw, Trash2 } from "lucide-react";
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
        className="flex justify-end gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="secondary"
          shape="square"
          aria-label={`Edit ${MASTER_META.treatments.label}`}
          title="Edit"
          icon={<Pencil size={16} />}
          onClick={() => onEdit(row.id, row)}
        />
        <Button
          variant="secondary"
          shape="square"
          aria-label={`${row.is_active ? "Nonaktifkan" : "Aktifkan"} ${MASTER_META.treatments.label}`}
          title={row.is_active ? "Nonaktifkan" : "Aktifkan kembali"}
          icon={row.is_active ? <PowerOff size={16} /> : <RotateCcw size={16} />}
          loading={isTogglePending}
          onClick={() => onToggleActive(row.id, !row.is_active)}
        />
        <Button
          variant="secondary-destructive"
          shape="square"
          aria-label={`Hapus permanen ${MASTER_META.treatments.label}`}
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
