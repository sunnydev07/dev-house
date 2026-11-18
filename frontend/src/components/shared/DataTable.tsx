import React from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
}) {
  return (
    <div className="rounded-md bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
            {columns.map((col) => (
              <th key={col.key} className={`py-2.5 px-4 ${col.align === "right" ? "text-right" : "text-left"}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="hover:bg-[var(--surface-raised)]/40">
              {columns.map((col) => (
                <td key={col.key} className={`py-2.5 px-4 ${col.align === "right" ? "text-right" : "text-left"}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
