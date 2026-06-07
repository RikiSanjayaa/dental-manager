import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import { PowerOff, RotateCcw, Search, Trash2 } from "lucide-react";

import { MASTER_META } from "./constants";
import type { MasterFilters, MasterTarget } from "./types";

type Props = {
  activeTab: MasterTarget;
  search: string;
  filters: MasterFilters;
  selectedIds: number[];
  groupOptions: string[];
  isTogglePending: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (filters: MasterFilters) => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
};

export function MasterToolbar({
  activeTab,
  search,
  filters,
  selectedIds,
  groupOptions,
  isTogglePending,
  onSearchChange,
  onFilterChange,
  onDeactivate,
  onActivate,
  onDeleteSelected,
  onClearSelection,
}: Props) {
  const groupLabel =
    activeTab === "treatments"
      ? "kategori"
      : activeTab === "doctors"
        ? "bank"
        : "jabatan";

  const allGroupLabel =
    activeTab === "treatments"
      ? "Semua kategori"
      : activeTab === "doctors"
        ? "Semua bank"
        : "Semua jabatan";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search size={16} className="text-kumo-subtle" />
          <Input
            className="flex-1"
            aria-label={`Cari ${MASTER_META[activeTab].label}`}
            placeholder={`Cari ${MASTER_META[activeTab].label.toLowerCase()}...`}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Select
          className="w-36"
          aria-label="Filter status"
          value={filters.status}
          renderValue={(value) =>
            value === "active"
              ? "Aktif"
              : value === "inactive"
                ? "Nonaktif"
                : "Semua status"
          }
          onValueChange={(value) =>
            onFilterChange({
              ...filters,
              status: value as MasterFilters["status"],
            })
          }
        >
          <Select.Option value="active">Aktif</Select.Option>
          <Select.Option value="inactive">Nonaktif</Select.Option>
          <Select.Option value="all">Semua status</Select.Option>
        </Select>
        <Select
          className="w-44"
          aria-label={`Filter ${groupLabel}`}
          value={filters.group}
          renderValue={(value) =>
            String(value) === "all" ? allGroupLabel : String(value)
          }
          onValueChange={(value) =>
            onFilterChange({ ...filters, group: String(value) })
          }
        >
          <Select.Option value="all">{allGroupLabel}</Select.Option>
          {groupOptions.map((option) => (
            <Select.Option key={option} value={option}>
              {option}
            </Select.Option>
          ))}
        </Select>
      </div>

      {selectedIds.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kumo-hairline bg-kumo-base px-3 py-2">
          <span className="text-sm font-medium text-kumo-default">
            {selectedIds.length}{" "}
            {MASTER_META[activeTab].label.toLowerCase()} dipilih
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<PowerOff size={15} />}
              loading={isTogglePending}
              onClick={onDeactivate}
            >
              Nonaktifkan
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={15} />}
              loading={isTogglePending}
              onClick={onActivate}
            >
              Aktifkan
            </Button>
            <Button
              variant="secondary-destructive"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={onDeleteSelected}
            >
              Hapus permanen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              Batal pilih
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
