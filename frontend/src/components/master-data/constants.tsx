import { Search, Stethoscope, Users } from "lucide-react";
import type { ReactNode } from "react";

import type { MasterTarget } from "./types";

export const MASTER_META: Record<
  MasterTarget,
  {
    label: string;
    singular: string;
    icon: ReactNode;
    description: string;
    template: string;
  }
> = {
  treatments: {
    label: "Treatment",
    singular: "Treatment",
    icon: <Search size={16} />,
    description: "Harga tindakan, BHP, jasa, kategori, dan kode treatment.",
    template: "treatments",
  },
  doctors: {
    label: "Dokter",
    singular: "Dokter",
    icon: <Stethoscope size={16} />,
    description: "Identitas dokter, rekening, NIK, dan default fee rate.",
    template: "doctors",
  },
  employees: {
    label: "Karyawan",
    singular: "Karyawan",
    icon: <Users size={16} />,
    description:
      "Profil karyawan, gaji pokok, hari kerja, dan rekening payroll.",
    template: "employees",
  },
};
