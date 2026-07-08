import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Combobox } from "@cloudflare/kumo/components/combobox";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Field } from "@cloudflare/kumo/components/field";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { Switch } from "@cloudflare/kumo/components/switch";

import { DatePickerPopover } from "../DatePickerPopover";
import { rupiah } from "../../lib/api";
import { numberField } from "../../lib/number-fields";
import type { Doctor, EditorSession, Treatment } from "./types";

type TreatmentOption = {
  value: string;
  label: string;
  search: string;
  treatment: Treatment;
};

type TreatmentOptionGroup = {
  value: string;
  items: TreatmentOption[];
};

type DoctorOption = {
  value: string;
  label: string;
  search: string;
};

type Props = {
  editor: EditorSession;
  doctors: Doctor[];
  treatments: Treatment[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldChange: (field: string, value: string) => void;
  onSubmit: () => void;
  onSubmitAndAddAnother: () => void;
};

export function TransactionEditorDialog({
  editor,
  doctors,
  treatments,
  isSaving,
  onOpenChange,
  onFieldChange,
  onSubmit,
  onSubmitAndAddAnother,
}: Props) {
  const values = editor.values;
  const selectedTreatment = treatments.find((item) => String(item.id) === values.treatment_id);
  const qty = Number(values.qty || 1);
  const discount = Number(values.discount_amount || 0);
  const bhp = values.bhp_override === "" ? (selectedTreatment?.bhp_cost ?? 0) : Number(values.bhp_override || 0);
  const price = values.price_override === "" ? (selectedTreatment?.treatment_price ?? 0) : Number(values.price_override || 0);
  const service = Math.max(price * qty - bhp * qty - discount, 0);
  const bill = Math.max(price * qty - discount, 0);
  const needsReview = values.needs_review === "true";
  const doctorOptions = doctors.map((doctor) => ({
    value: String(doctor.id),
    label: doctor.name,
    search: doctor.name,
  }));
  const selectedDoctorOption =
    doctorOptions.find((item) => item.value === values.doctor_id) ?? null;
  const treatmentOptions = treatments
    .map((treatment) => ({
      value: String(treatment.id),
      label: [treatment.code, treatment.name].filter(Boolean).join(" - "),
      search: [treatment.code, treatment.name, treatment.category].filter(Boolean).join(" "),
      treatment,
    }))
    .sort((a, b) => {
      const categoryCompare = categoryLabel(a.treatment).localeCompare(categoryLabel(b.treatment));
      if (categoryCompare !== 0) return categoryCompare;
      return a.label.localeCompare(b.label);
    });
  const selectedTreatmentOption =
    treatmentOptions.find((item) => item.value === values.treatment_id) ?? null;
  const treatmentGroups: TreatmentOptionGroup[] = Array.from(
    treatmentOptions.reduce((groups, option) => {
      const category = categoryLabel(option.treatment);
      groups.set(category, [...(groups.get(category) ?? []), option]);
      return groups;
    }, new Map<string, TreatmentOption[]>()),
  ).map(([value, items]) => ({ value, items }));

  function chooseTreatment(value: string) {
    const treatment = treatments.find((item) => String(item.id) === value);
    onFieldChange("treatment_id", value);
    onFieldChange("treatment_name_snapshot", treatment?.name ?? "");
  }

  return (
    <Dialog.Root open={editor.open} onOpenChange={onOpenChange}>
      <Dialog
        size="xl"
        className="p-0"
        style={{ height: "95vh", maxHeight: "95vh", overflow: "hidden" }}
      >
        <form
          className="treatment-history-editor-form flex h-full min-h-0 flex-col"
          style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="border-b border-kumo-hairline px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-bold">
                  {editor.mode === "edit" ? "Edit" : "Tambah"} Riwayat Perawatan
                </Dialog.Title>
                <Dialog.Description>
                  Input tindakan pasien dengan nilai final untuk rekap fee dokter.
                </Dialog.Description>
              </div>
              <Badge variant={editor.mode === "edit" ? "secondary" : "success"}>
                {editor.mode === "edit" ? "Edit data" : "Data baru"}
              </Badge>
            </div>
          </div>

          <div
            className="px-6 py-4"
            style={{ minHeight: 0, flex: "1 1 0%", overflow: "auto" }}
          >
            <Grid variant="2up" gap="sm">
              <Field
                label="Periode"
                labelTooltip="Bulan transaksi yang dipakai saat rekap fee dokter, format YYYY-MM."
              >
                <Input
                  type="month"
                  required
                  value={values.period}
                  onChange={(event) => onFieldChange("period", event.target.value)}
                />
              </Field>
              <Field
                label="Tanggal"
                labelTooltip="Tanggal tindakan pasien dilakukan. Jika periode kosong saat import, periode diambil dari tanggal ini."
              >
                <DatePickerPopover value={values.transaction_date} onChange={(value) => onFieldChange("transaction_date", value)} />
              </Field>
              {needsReview ? (
                <GridItem className="md:col-span-2" style={{ gridColumn: "1 / -1" }}>
                  <Field
                    label="Catatan Review"
                    labelTooltip="Alasan transaksi ditandai perlu review, misalnya harga belum pasti, treatment perlu dicek, atau data pasien perlu konfirmasi."
                    required={false}
                  >
                    <Input
                      placeholder="Contoh: cek ulang harga atau fee khusus"
                      value={values.review_note}
                      onChange={(event) => onFieldChange("review_note", event.target.value)}
                    />
                  </Field>
                </GridItem>
              ) : null}
              <div className="w-full">
                <Combobox
                  label="Dokter"
                  labelTooltip="Dokter yang mengerjakan tindakan. Data rekening, pajak, dan default fee rate diambil dari Master Data Dokter."
                  required
                  items={doctorOptions}
                  value={selectedDoctorOption}
                  itemToStringLabel={(item: DoctorOption) => item?.label ?? ""}
                  itemToStringValue={(item: DoctorOption) => item?.value ?? ""}
                  isItemEqualToValue={(item: DoctorOption, value: DoctorOption) => item?.value === value?.value}
                  filter={(item: DoctorOption, query: string) =>
                    Boolean(item?.search?.toLowerCase().includes(query.trim().toLowerCase()))
                  }
                  onValueChange={(value) => onFieldChange("doctor_id", value?.value ?? "")}
                >
                  <Combobox.TriggerInput className="w-full" placeholder="Cari dokter..." />
                  <Combobox.Content>
                    <Combobox.List>
                      {(item: DoctorOption) => (
                        <Combobox.Item value={item}>
                          {item.label}
                        </Combobox.Item>
                      )}
                    </Combobox.List>
                    <Combobox.Empty>Dokter tidak ditemukan</Combobox.Empty>
                  </Combobox.Content>
                </Combobox>
              </div>
              <Field
                label="Nama Pasien"
                labelTooltip="Nama pasien pada transaksi. Nama ini menjadi snapshot riwayat dan tidak memerlukan master pasien untuk v1."
              >
                <Input
                  required
                  value={values.patient_name}
                  onChange={(event) => onFieldChange("patient_name", event.target.value)}
                />
              </Field>
              <GridItem className="md:col-span-2" style={{ gridColumn: "1 / -1" }}>
                <div className="w-full">
                  <Combobox
                    label="Perawatan"
                    labelTooltip="Treatment dari Master Data. BHP dan biaya perawatan default otomatis mengikuti treatment yang dipilih."
                    required
                    items={treatmentGroups}
                    value={selectedTreatmentOption}
                    itemToStringLabel={(item: TreatmentOption) => item?.label ?? ""}
                    itemToStringValue={(item: TreatmentOption) => item?.value ?? ""}
                    isItemEqualToValue={(item: TreatmentOption, value: TreatmentOption) => item?.value === value?.value}
                    filter={(item: TreatmentOption, query: string) =>
                      Boolean(item?.search?.toLowerCase().includes(query.trim().toLowerCase()))
                    }
                    onValueChange={(value) => chooseTreatment(value?.value ?? "")}
                  >
                    <Combobox.TriggerInput className="w-full" placeholder="Cari kode atau nama treatment..." />
                    <Combobox.Content>
                      <Combobox.Empty>Treatment tidak ditemukan</Combobox.Empty>
                      <Combobox.List>
                        {(group: TreatmentOptionGroup) => (
                          <Combobox.Group key={group.value} items={group.items}>
                            <Combobox.GroupLabel>{group.value}</Combobox.GroupLabel>
                            <Combobox.Collection>
                              {(item: TreatmentOption) => (
                                <TreatmentComboboxItem key={item.value} item={item} />
                              )}
                            </Combobox.Collection>
                          </Combobox.Group>
                        )}
                      </Combobox.List>
                    </Combobox.Content>
                  </Combobox>
                </div>
              </GridItem>
              <Field
                label="Qty"
                labelTooltip="Jumlah tindakan pada baris transaksi. Total billing dan jasa dihitung dari harga dikali qty."
              >
                <Input
                  type="number"
                  {...numberField.positiveCount}
                  value={values.qty}
                  onChange={(event) => onFieldChange("qty", event.target.value)}
                />
              </Field>
              <Field
                label="Diskon"
                labelTooltip="Nominal potongan rupiah pada transaksi, bukan persentase. Nilai ini mengurangi biaya jasa dan total biaya pasien."
              >
                <Input
                  type="number"
                  {...numberField.money}
                  value={values.discount_amount}
                  onChange={(event) => onFieldChange("discount_amount", event.target.value)}
                />
              </Field>
              <Field
                label="Fee Khusus Behel"
                labelTooltip="Nominal fee khusus orthodonti/behel jika transaksi memakai fee khusus. Isi 0 untuk memakai fee dokter normal."
              >
                <Input
                  type="number"
                  {...numberField.money}
                  value={values.special_fee_amount}
                  onChange={(event) => onFieldChange("special_fee_amount", event.target.value)}
                />
              </Field>
              <Field
                label="Override BHP"
                labelTooltip="Kosongkan untuk memakai BHP dari Master Data. Isi hanya jika BHP transaksi berbeda dari default."
                required={false}
              >
                <Input
                  type="number"
                  {...numberField.money}
                  placeholder={selectedTreatment ? rupiah.format(selectedTreatment.bhp_cost) : "Ikuti master"}
                  value={values.bhp_override}
                  onChange={(event) => onFieldChange("bhp_override", event.target.value)}
                />
              </Field>
              <Field
                label="Override Biaya Perawatan"
                labelTooltip="Kosongkan untuk memakai harga treatment dari Master Data. Isi hanya jika harga pasien pada transaksi berbeda."
                required={false}
              >
                <Input
                  type="number"
                  {...numberField.money}
                  placeholder={selectedTreatment ? rupiah.format(selectedTreatment.treatment_price) : "Ikuti master"}
                  value={values.price_override}
                  onChange={(event) => onFieldChange("price_override", event.target.value)}
                />
              </Field>
              <Field
                label="Override Fee Rate"
                labelTooltip="Kosongkan untuk memakai fee rate dokter. Isi 60 untuk 60% dari biaya jasa."
                required={false}
              >
                <Input
                  type="number"
                  {...numberField.percent}
                  placeholder="Ikuti rate dokter"
                  value={values.fee_rate}
                  onChange={(event) => onFieldChange("fee_rate", event.target.value)}
                />
              </Field>
              <div style={{ gridColumn: "1 / -1", width: "100%" }}>
                <div className="rounded-lg border border-kumo-hairline bg-kumo-base px-4 py-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-kumo-default">Preview Perhitungan</div>
                      <div className="mt-1 text-xs text-kumo-subtle">
                        Harga {rupiah.format(price)} x {qty || 0} - BHP {rupiah.format(bhp)} x {qty || 0} - diskon {rupiah.format(discount)}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 md:w-[440px]">
                      <PreviewTotal label="Biaya Jasa" value={rupiah.format(service)} />
                      <PreviewTotal label="Total Biaya Pasien" value={rupiah.format(bill)} strong />
                    </div>
                  </div>
                </div>
              </div>
            </Grid>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kumo-hairline bg-kumo-base px-6 py-4">
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                variant="neutral"
                label="Perlu review"
                labelTooltip="Nyalakan jika transaksi perlu dicek lagi sebelum rekap Fee Dokter dilock."
                checked={needsReview}
                onCheckedChange={(checked) => onFieldChange("needs_review", checked ? "true" : "false")}
              />
              <Badge variant={needsReview ? "error" : "success"}>
                {needsReview ? "Review" : "OK"}
              </Badge>
            </div>
            <div className="dialog-action-buttons dialog-action-buttons--primary-extra flex flex-wrap justify-end gap-2">
              <Dialog.Close render={(props) => <Button {...props} variant="secondary" type="button">Batal</Button>} />
              {editor.mode === "create" ? (
                <Button
                  variant="secondary"
                  type="button"
                  loading={isSaving}
                  disabled={!values.doctor_id || !values.patient_name.trim() || !values.treatment_name_snapshot.trim()}
                  onClick={onSubmitAndAddAnother}
                >
                  Simpan & tambah perawatan
                </Button>
              ) : null}
              <Button
                variant="primary"
                type="submit"
                loading={isSaving}
                disabled={!values.doctor_id || !values.patient_name.trim() || !values.treatment_name_snapshot.trim()}
              >
                Simpan
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}

function TreatmentComboboxItem({ item }: { item: TreatmentOption }) {
  return (
    <Combobox.Item value={item}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-sm font-medium text-kumo-default">
          {item.treatment.code || "-"}
        </span>
        <span className="min-w-0 truncate text-sm text-kumo-subtle">
          {item.treatment.name}
        </span>
      </div>
    </Combobox.Item>
  );
}

function categoryLabel(treatment: Treatment) {
  return treatment.category?.trim() || "Tanpa kategori";
}

function PreviewTotal({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-kumo-canvas px-3 py-2">
      <span className="text-xs font-medium text-kumo-subtle">{label}</span>
      <span className={`text-sm font-semibold text-kumo-default ${strong ? "text-base" : ""}`}>{value}</span>
    </div>
  );
}
