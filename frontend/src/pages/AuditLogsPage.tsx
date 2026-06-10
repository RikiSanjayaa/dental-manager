import { Badge } from "@cloudflare/kumo/components/badge";
import { Input } from "@cloudflare/kumo/components/input";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Select } from "@cloudflare/kumo/components/select";
import { Text } from "@cloudflare/kumo/components/text";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "../components/DataTable";
import { api } from "../lib/api";

type AuditLog = {
  id: number;
  actor_id: number | null;
  actor_username: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

function includesText(value: unknown, query: string) {
  return String(value ?? "")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function actionBadge(action: string) {
  const variant =
    action === "delete"
      ? "error"
      : action === "lock" || action === "export"
        ? "info"
        : action === "create" || action === "import"
          ? "success"
          : "secondary";
  return <Badge variant={variant}>{action}</Badge>;
}

function formatDateTime(value: string) {
  const normalizedValue = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  }).format(new Date(normalizedValue))} WITA`;
}

type Props = {
  selfOnly?: boolean;
};

export function AuditLogsPage({ selfOnly = false }: Props) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  const { data: logs } = useQuery({
    queryKey: ["audit-logs", selfOnly ? "me" : "all"],
    queryFn: () => api<AuditLog[]>(selfOnly ? "/audit-logs/me?limit=300" : "/audit-logs?limit=300"),
  });

  const actionOptions = useMemo(
    () => Array.from(new Set((logs ?? []).map((log) => log.action))).sort(),
    [logs],
  );
  const entityOptions = useMemo(
    () =>
      Array.from(new Set((logs ?? []).map((log) => log.entity_type))).sort(),
    [logs],
  );

  const filteredLogs = useMemo(
    () =>
      (logs ?? []).filter((log) => {
        const matchesAction =
          actionFilter === "all" || log.action === actionFilter;
        const matchesEntity =
          entityFilter === "all" || log.entity_type === entityFilter;
        const matchesSearch =
          !search ||
          [
            log.actor_name,
            log.actor_username,
            log.description,
            log.entity_type,
            log.entity_id,
          ].some((value) => includesText(value, search));
        return matchesAction && matchesEntity && matchesSearch;
      }),
    [actionFilter, entityFilter, logs, search],
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-600">
            {selfOnly
              ? "Jejak aktivitas akun Anda untuk login, export, absensi, dan perubahan data."
              : "Jejak perubahan penting user, transaksi, absensi, lock periode, dan export."}
          </p>
        </div>
      </div>

      <LayerCard className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History size={20} className="text-kumo-brand" />
            <div>
              <Text as="h2" variant="heading3">
                {selfOnly ? "Aktivitas Akun Saya" : "Aktivitas Sistem"}
              </Text>
              <p className="mt-1 text-sm text-kumo-subtle">
                {filteredLogs.length} log ditampilkan.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-kumo-subtle" />
              <Input
                aria-label="Cari audit log"
                placeholder="Cari aktor, entitas, atau deskripsi..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              className="w-40"
              aria-label="Filter aksi"
              value={actionFilter}
              renderValue={(value) =>
                value === "all" ? "Semua aksi" : String(value)
              }
              onValueChange={(value) => setActionFilter(String(value))}
            >
              <Select.Option value="all">Semua aksi</Select.Option>
              {actionOptions.map((action) => (
                <Select.Option key={action} value={action}>
                  {action}
                </Select.Option>
              ))}
            </Select>
            <Select
              className="w-52"
              aria-label="Filter entitas"
              value={entityFilter}
              renderValue={(value) =>
                value === "all" ? "Semua entitas" : String(value)
              }
              onValueChange={(value) => setEntityFilter(String(value))}
            >
              <Select.Option value="all">Semua entitas</Select.Option>
              {entityOptions.map((entity) => (
                <Select.Option key={entity} value={entity}>
                  {entity}
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>

        <DataTable
          rows={filteredLogs}
          pagination
          pageSize={25}
          minTableWidth={1120}
          rowKey={(row) => row.id}
          empty="Belum ada audit log."
          columns={[
            {
              key: "time",
              header: "Waktu",
              width: 180,
              render: (row) => formatDateTime(row.created_at),
            },
            {
              key: "actor",
              header: "Aktor",
              render: (row) => row.actor_name ?? row.actor_username ?? "System",
            },
            {
              key: "action",
              header: "Aksi",
              render: (row) => actionBadge(row.action),
            },
            {
              key: "entity",
              header: "Entitas",
              render: (row) => row.entity_type,
            },
            { key: "id", header: "ID", render: (row) => row.entity_id ?? "-" },
            {
              key: "description",
              header: "Deskripsi",
              render: (row) => row.description,
            },
            {
              key: "metadata",
              header: "Metadata",
              render: (row) => (
                <code className="block max-w-80 truncate rounded bg-kumo-base px-2 py-1 text-xs text-kumo-subtle">
                  {Object.keys(row.metadata_json ?? {}).length
                    ? JSON.stringify(row.metadata_json)
                    : "-"}
                </code>
              ),
            },
          ]}
        />
      </LayerCard>
    </>
  );
}
