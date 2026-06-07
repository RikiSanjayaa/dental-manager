import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";
import { Search, X } from "lucide-react";

import type { Doctor } from "./types";

type Props = {
  search: string;
  doctorFilter: string;
  reviewFilter: string;
  dateFilter: string;
  doctors: Doctor[];
  onSearchChange: (value: string) => void;
  onDoctorFilterChange: (value: string) => void;
  onReviewFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onClear: () => void;
};

export function TreatmentHistoryToolbar({
  search,
  doctorFilter,
  reviewFilter,
  dateFilter,
  doctors,
  onSearchChange,
  onDoctorFilterChange,
  onReviewFilterChange,
  onDateFilterChange,
  onClear,
}: Props) {
  const hasFilter = search || doctorFilter !== "all" || reviewFilter !== "all" || dateFilter;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-72 flex-1 items-center gap-2">
          <Search size={16} className="text-kumo-subtle" />
          <Input
            aria-label="Cari riwayat perawatan"
            className="flex-1"
            placeholder="Cari pasien, dokter, atau perawatan..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <Select
          className="w-48"
          aria-label="Filter dokter"
          value={doctorFilter}
          renderValue={(value) => {
            if (String(value) === "all") return "Semua dokter";
            return doctors.find((doctor) => String(doctor.id) === String(value))?.name ?? "Dokter";
          }}
          onValueChange={(value) => onDoctorFilterChange(String(value))}
        >
          <Select.Option value="all">Semua dokter</Select.Option>
          {doctors.map((doctor) => (
            <Select.Option key={doctor.id} value={String(doctor.id)}>
              {doctor.name}
            </Select.Option>
          ))}
        </Select>
        <Select
          className="w-40"
          aria-label="Filter review"
          value={reviewFilter}
          renderValue={(value) =>
            value === "review" ? "Perlu review" : value === "ok" ? "OK" : "Semua status"
          }
          onValueChange={(value) => onReviewFilterChange(String(value))}
        >
          <Select.Option value="all">Semua status</Select.Option>
          <Select.Option value="review">Perlu review</Select.Option>
          <Select.Option value="ok">OK</Select.Option>
        </Select>
        <Input
          className="w-40"
          aria-label="Filter tanggal transaksi"
          type="date"
          value={dateFilter}
          onChange={(event) => onDateFilterChange(event.target.value)}
        />
        <Button
          variant="ghost"
          shape="square"
          aria-label="Bersihkan filter"
          disabled={!hasFilter}
          icon={<X size={17} />}
          onClick={onClear}
        />
      </div>
    </div>
  );
}
