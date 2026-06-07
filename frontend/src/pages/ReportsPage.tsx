import { Button } from "@cloudflare/kumo/components/button";
import { Grid, GridItem } from "@cloudflare/kumo/components/grid";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { FileDown } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { downloadFile } from "../lib/api";

export function ReportsPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  return (
    <>
      <PageHeader title="Reports" eyebrow="Export xlsx dan slip PDF" actions={<Input className="w-40" aria-label="Periode laporan" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />} />
      <Grid variant="2up" gap="sm">
        <GridItem>
        <LayerCard className="grid min-h-44 justify-items-start gap-3 p-5">
          <FileDown size={22} />
          <Text as="strong" variant="body" bold>Rekap Fee Dokter</Text>
          <Text variant="secondary" size="sm">XLSX transfer dokter untuk periode aktif.</Text>
          <Button variant="secondary" icon={<FileDown size={18} />} onClick={() => downloadFile(`/reports/doctor-fees?period=${period}&format=xlsx`, `doctor-fees-${period}.xlsx`)}>Download</Button>
        </LayerCard>
        </GridItem>
        <GridItem>
        <LayerCard className="grid min-h-44 justify-items-start gap-3 p-5">
          <FileDown size={22} />
          <Text as="strong" variant="body" bold>Rekap Payroll</Text>
          <Text variant="secondary" size="sm">XLSX payroll lengkap untuk finance.</Text>
          <Button variant="secondary" icon={<FileDown size={18} />} onClick={() => downloadFile(`/reports/payroll?period=${period}&format=xlsx`, `payroll-${period}.xlsx`)}>Download</Button>
        </LayerCard>
        </GridItem>
      </Grid>
    </>
  );
}
