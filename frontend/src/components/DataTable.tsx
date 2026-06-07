import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pagination } from "@cloudflare/kumo/components/pagination";
import { Table } from "@cloudflare/kumo/components/table";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  pagination?: boolean;
  pageSize?: number;
  rowKey?: (row: T, index: number) => string | number;
};

export function DataTable<T>({ rows, columns, empty = "Belum ada data", pagination = false, pageSize = 10, rowKey }: Props<T>) {
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

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-lg border border-kumo-hairline bg-kumo-base">
        <Table className="w-full min-w-[760px]">
          <Table.Header sticky>
            <Table.Row>
              {columns.map((column) => (
                <Table.Head key={column.key} className={column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : undefined}>
                  {column.header}
                </Table.Head>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={columns.length} className="py-8 text-center text-kumo-subtle">
                  {empty}
                </Table.Cell>
              </Table.Row>
            ) : (
              pagedRows.map((row, index) => {
                const absoluteIndex = pagination ? (page - 1) * perPage + index : index;
                return (
                  <Table.Row key={rowKey ? rowKey(row, absoluteIndex) : absoluteIndex}>
                    {columns.map((column) => (
                      <Table.Cell key={column.key} className={column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : undefined}>
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
      {pagination && rows.length > pageSize ? (
        <Pagination page={page} setPage={setPage} perPage={perPage} totalCount={rows.length} className="flex flex-wrap items-center justify-between gap-3">
          <Pagination.Info>{({ pageShowingRange, totalCount }) => <span className="text-sm text-kumo-subtle">{pageShowingRange} dari {totalCount}</span>}</Pagination.Info>
          <Pagination.PageSize value={perPage} onChange={setPerPage} options={[10, 25, 50]} label="Per halaman:" />
          <Pagination.Controls pageSelector="dropdown" />
        </Pagination>
      ) : null}
    </div>
  );
}
