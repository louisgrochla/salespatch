"use client";

import { cn } from "@/lib/cn";
import { useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | Date | null | undefined;
  width?: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  empty?: React.ReactNode;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  rows,
  columns,
  empty,
  defaultSortKey,
  defaultSortDir = "desc",
  rowKey,
  onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey ?? columns[0]?.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, columns, sortKey, sortDir]);

  if (rows.length === 0) {
    return (
      <div className="border border-border bg-bg-panel px-4 py-8 text-center font-mono text-xs text-fg-dim">
        {empty ?? "No data."}
      </div>
    );
  }

  return (
    <div className="border border-border overflow-x-auto bg-bg-panel">
      <table className="nv-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = !!col.sortValue;
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    sortable && "cursor-pointer select-none hover:text-fg",
                  )}
                  onClick={() => {
                    if (!sortable) return;
                    if (active) {
                      setSortDir(sortDir === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey(col.key);
                      setSortDir("desc");
                    }
                  }}
                >
                  {col.header}
                  {active && (
                    <span className="ml-1 text-fg-dim">
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
