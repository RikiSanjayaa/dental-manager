import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { Pagination } from "@cloudflare/kumo/components/pagination";
import { Table } from "@cloudflare/kumo/components/table";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  sticky?: "left" | "right";
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  minTableWidth?: number;
  pagination?: boolean;
  pageSize?: number;
  rowKey?: (row: T, index: number) => string | number;
  selectable?: boolean;
  selectedKeys?: Set<string | number>;
  onToggleRow?: (row: T, selected: boolean, index: number) => void;
  onTogglePage?: (rows: T[], selected: boolean) => void;
};

export function DataTable<T>({
  rows,
  columns,
  empty = "Belum ada data",
  minTableWidth,
  pagination = false,
  pageSize = 10,
  rowKey,
  selectable = false,
  selectedKeys,
  onToggleRow,
  onTogglePage,
}: Props<T>) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const pagedRows = useMemo(() => {
    if (!pagination) return rows;
    const start = (page - 1) * perPage;
    return rows.slice(start, start + perPage);
  }, [page, pagination, perPage, rows]);

  useEffect(() => {
    setPage(1);
  }, [rows, perPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleKeys = pagedRows.map((row, index) => rowKey?.(row, pagination ? (page - 1) * perPage + index : index) ?? index);
  const selectedVisibleCount = selectedKeys ? visibleKeys.filter((key) => selectedKeys.has(key)).length : 0;
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisibleCount === visibleKeys.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleKeys.length;
  const stickyColumn = (column: Column<T>) => {
    if (column.sticky) return column.sticky;
    if (column.key === "actions") return "right";
    return undefined;
  };
  const alignClass = (align?: Column<T>["align"]) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : undefined;
  const computedMinWidth =
    minTableWidth ?? Math.max(920, columns.length * 150 + (selectable ? 52 : 0));

  return (
    <div className="space-y-3">
      <div className="w-full overflow-x-auto overflow-y-auto rounded-lg border border-kumo-hairline bg-kumo-base">
        <Table className="w-full" style={{ minWidth: computedMinWidth }}>
          <Table.Header sticky variant="compact">
            <Table.Row>
              {selectable ? (
                <Table.Head className="sticky left-0 z-[3] w-10 bg-kumo-base">
                  <Checkbox
                    aria-label="Pilih semua baris halaman ini"
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    onCheckedChange={(checked) => onTogglePage?.(pagedRows, Boolean(checked))}
                  />
                </Table.Head>
              ) : null}
              {columns.map((column) => (
                <Table.Head
                  key={column.key}
                  sticky={stickyColumn(column)}
                  className={`${alignClass(column.align) ?? ""} whitespace-nowrap text-xs`}
                >
                  {column.header || (column.key === "actions" ? <span className="sr-only">Aksi</span> : null)}
                </Table.Head>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={columns.length + (selectable ? 1 : 0)} className="py-8 text-center text-kumo-subtle">
                  {empty}
                </Table.Cell>
              </Table.Row>
            ) : (
              pagedRows.map((row, index) => {
                const absoluteIndex = pagination ? (page - 1) * perPage + index : index;
                const key = rowKey ? rowKey(row, absoluteIndex) : absoluteIndex;
                const selected = Boolean(selectedKeys?.has(key));
                return (
                  <Table.Row
                    key={key}
                    className={selectable ? `cursor-pointer ${selected ? "bg-kumo-brand/5" : ""}` : undefined}
                    onClick={selectable ? () => onToggleRow?.(row, !selected, absoluteIndex) : undefined}
                  >
                    {selectable ? (
                      <Table.Cell className="sticky left-0 z-[2] w-10 bg-kumo-base" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label="Pilih baris"
                          checked={selected}
                          onCheckedChange={(checked) => onToggleRow?.(row, Boolean(checked), absoluteIndex)}
                        />
                      </Table.Cell>
                    ) : null}
                    {columns.map((column) => (
                      <Table.Cell
                        key={column.key}
                        sticky={stickyColumn(column)}
                        className={`${alignClass(column.align) ?? ""} whitespace-nowrap`}
                      >
                        {column.render(row)}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
      </div>
      {pagination && rows.length > 0 ? (
        <Pagination page={page} setPage={setPage} perPage={perPage} totalCount={rows.length} className="flex flex-wrap items-center justify-between gap-3">
          <Pagination.Info>{({ pageShowingRange, totalCount }) => <span className="text-sm text-kumo-subtle">{pageShowingRange} dari {totalCount}</span>}</Pagination.Info>
          <Pagination.PageSize value={perPage} onChange={setPerPage} options={[10, 25, 50]} label="Per halaman:" />
          <Pagination.Controls pageSelector="dropdown" />
        </Pagination>
      ) : null}
    </div>
  );
}
