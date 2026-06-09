import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Field } from "@cloudflare/kumo/components/field";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { Select } from "@cloudflare/kumo/components/select";

import { DatePickerPopover } from "../DatePickerPopover";
import { MASTER_META } from "./constants";
import type { EditorSession } from "./types";

type Props = {
  editor: EditorSession;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldChange: (field: string, value: string) => void;
  onSubmit: () => void;
};

export function RecordEditorDialog({
  editor,
  isSaving,
  onOpenChange,
  onFieldChange,
  onSubmit,
}: Props) {
  const v = editor.values;

  return (
    <Dialog.Root
      open={editor.open}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <Dialog size="xl" className="max-h-[90vh] overflow-hidden p-0">
        <form
          className="master-editor-form flex max-h-[90vh] flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {/* Header */}
          <div className="border-b border-kumo-hairline px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-bold">
                  {editor.mode === "edit" ? "Edit" : "Tambah"}{" "}
                  {MASTER_META[editor.target].label}
                </Dialog.Title>
                <Dialog.Description>
                  Isi data master dengan value final yang dipakai untuk
                  kalkulasi.
                </Dialog.Description>
              </div>
              <Badge
                variant={editor.mode === "edit" ? "secondary" : "success"}
              >
                {editor.mode === "edit" ? "Edit data" : "Data baru"}
              </Badge>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <Grid variant="2up" gap="sm">
              {/* Name — shared by all targets */}
              <GridItem className="md:col-span-2">
                <Field label="Nama" required>
                  <Input
                    required
                    value={v.name ?? ""}
                    onChange={(event) =>
                      onFieldChange("name", event.target.value)
                    }
                  />
                </Field>
              </GridItem>

              {/* ── Treatment fields ── */}
              {editor.target === "treatments" ? (
                <>
                  <Field
                    label="Kode"
                    labelTooltip="Kode unik treatment, contoh: TRT-001"
                    required={false}
                  >
                    <Input
                      value={v.code ?? ""}
                      onChange={(event) =>
                        onFieldChange("code", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Kategori" required={false}>
                    <Input
                      value={v.category ?? ""}
                      onChange={(event) =>
                        onFieldChange("category", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Jasa Dokter"
                    labelTooltip="Jasa dokter umum dari total harga treatment"
                  >
                    <Input
                      type="number"
                      value={v.doctor_cost ?? "0"}
                      onChange={(event) =>
                        onFieldChange("doctor_cost", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Jasa Spesialis"
                    labelTooltip="Jasa dokter spesialis dari total harga treatment"
                  >
                    <Input
                      type="number"
                      value={v.specialist_cost ?? "0"}
                      onChange={(event) =>
                        onFieldChange("specialist_cost", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="BHP"
                    labelTooltip="Biaya Habis Pakai (bahan dan alat sekali pakai)"
                  >
                    <Input
                      type="number"
                      value={v.bhp_cost ?? "0"}
                      onChange={(event) =>
                        onFieldChange("bhp_cost", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Service Fee"
                    labelTooltip="Biaya layanan dan administrasi"
                  >
                    <Input
                      type="number"
                      value={v.service_fee ?? "0"}
                      onChange={(event) =>
                        onFieldChange("service_fee", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Harga Treatment"
                    labelTooltip="Harga total yang dibayar pasien"
                  >
                    <Input
                      type="number"
                      value={v.treatment_price ?? "0"}
                      onChange={(event) =>
                        onFieldChange("treatment_price", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Status">
                    <Select
                      aria-label="Status treatment"
                      value={v.is_active}
                      renderValue={(value) =>
                        value === "true" ? "Aktif" : "Nonaktif"
                      }
                      onValueChange={(value) =>
                        onFieldChange("is_active", String(value))
                      }
                    >
                      <Select.Option value="true">Aktif</Select.Option>
                      <Select.Option value="false">Nonaktif</Select.Option>
                    </Select>
                  </Field>
                  <GridItem className="md:col-span-2">
                    <Field label="Catatan" required={false}>
                      <Input
                        value={v.notes ?? ""}
                        onChange={(event) =>
                          onFieldChange("notes", event.target.value)
                        }
                      />
                    </Field>
                  </GridItem>
                </>
              ) : null}

              {/* ── Doctor fields ── */}
              {editor.target === "doctors" ? (
                <>
                  <Field label="Bank" required={false}>
                    <Input
                      value={v.bank_name ?? ""}
                      onChange={(event) =>
                        onFieldChange("bank_name", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Nama Rekening" required={false}>
                    <Input
                      value={v.account_name ?? ""}
                      onChange={(event) =>
                        onFieldChange("account_name", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="No Rekening" required={false}>
                    <Input
                      value={v.account_number ?? ""}
                      onChange={(event) =>
                        onFieldChange("account_number", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="NIK"
                    labelTooltip="Nomor Induk Kependudukan"
                    required={false}
                  >
                    <Input
                      value={v.nik ?? ""}
                      onChange={(event) =>
                        onFieldChange("nik", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Fee Normal"
                    labelTooltip="Persentase fee tindakan normal (contoh: 0.6 = 60%)"
                  >
                    <Input
                      type="number"
                      step="0.001"
                      value={v.normal_fee_rate ?? "0"}
                      onChange={(event) =>
                        onFieldChange("normal_fee_rate", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Fee Ortho"
                    labelTooltip="Persentase fee tindakan orthodonti (contoh: 0.7 = 70%)"
                  >
                    <Input
                      type="number"
                      step="0.001"
                      value={v.ortho_fee_rate ?? "0"}
                      onChange={(event) =>
                        onFieldChange("ortho_fee_rate", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Pajak"
                    labelTooltip="Tarif pajak penghasilan dokter (contoh: 0.025 = 2.5%)"
                  >
                    <Input
                      type="number"
                      step="0.001"
                      value={v.tax_rate ?? "0"}
                      onChange={(event) =>
                        onFieldChange("tax_rate", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Status">
                    <Select
                      aria-label="Status dokter"
                      value={v.is_active}
                      renderValue={(value) =>
                        value === "true" ? "Aktif" : "Nonaktif"
                      }
                      onValueChange={(value) =>
                        onFieldChange("is_active", String(value))
                      }
                    >
                      <Select.Option value="true">Aktif</Select.Option>
                      <Select.Option value="false">Nonaktif</Select.Option>
                    </Select>
                  </Field>
                </>
              ) : null}

              {/* ── Employee fields ── */}
              {editor.target === "employees" ? (
                <>
                  <Field
                    label="ID Absensi"
                    labelTooltip="ID dari mesin fingerprint atau file absensi. Dipakai untuk mencocokkan import absensi ke karyawan."
                    required={false}
                  >
                    <Input
                      value={v.attendance_id ?? ""}
                      onChange={(event) =>
                        onFieldChange("attendance_id", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Jabatan" required={false}>
                    <Input
                      value={v.position ?? ""}
                      onChange={(event) =>
                        onFieldChange("position", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Tanggal Masuk" required={false}>
                    <DatePickerPopover value={v.join_date ?? ""} onChange={(value) => onFieldChange("join_date", value)} />
                  </Field>
                  <Field
                    label="Gaji Pokok"
                    labelTooltip="Gaji pokok bulanan sebelum tunjangan"
                  >
                    <Input
                      type="number"
                      value={v.base_salary ?? "0"}
                      onChange={(event) =>
                        onFieldChange("base_salary", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Hari Kerja"
                    labelTooltip="Jumlah hari kerja dalam sebulan untuk perhitungan gaji"
                  >
                    <Input
                      type="number"
                      value={v.working_days ?? "25"}
                      onChange={(event) =>
                        onFieldChange("working_days", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Bank" required={false}>
                    <Input
                      value={v.bank_name ?? ""}
                      onChange={(event) =>
                        onFieldChange("bank_name", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Nama Rekening" required={false}>
                    <Input
                      value={v.account_name ?? ""}
                      onChange={(event) =>
                        onFieldChange("account_name", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="No Rekening" required={false}>
                    <Input
                      value={v.account_number ?? ""}
                      onChange={(event) =>
                        onFieldChange("account_number", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Status">
                    <Select
                      aria-label="Status karyawan"
                      value={v.is_active}
                      renderValue={(value) =>
                        value === "true" ? "Aktif" : "Nonaktif"
                      }
                      onValueChange={(value) =>
                        onFieldChange("is_active", String(value))
                      }
                    >
                      <Select.Option value="true">Aktif</Select.Option>
                      <Select.Option value="false">Nonaktif</Select.Option>
                    </Select>
                  </Field>
                </>
              ) : null}
            </Grid>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" type="button">
                  Batal
                </Button>
              )}
            />
            <Button
              variant="primary"
              type="submit"
              loading={isSaving}
              disabled={!v.name?.trim()}
            >
              Simpan
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
