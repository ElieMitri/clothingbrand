import { MoreHorizontal } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: DataTableColumn<T>[];
  selectedIds: string[];
  onToggleRow: (id: string) => void;
  onTogglePage: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  rowActions?: Array<{ label: string; onClick: (row: T) => void }>;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  selectedIds,
  onToggleRow,
  onTogglePage,
  page,
  pageSize,
  onPageChange,
  rowActions,
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const allSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.id));

  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onTogglePage}
                aria-label="Select visible rows"
              />
            </th>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.header}
              </th>
            ))}
            {rowActions ? <th aria-label="Actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr key={row.id} onClick={() => onRowClick?.(row)}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggleRow(row.id)}
                  aria-label={`Select row ${row.id}`}
                />
              </td>
              {columns.map((column) => (
                <td key={`${row.id}-${column.key}`}>{column.render(row)}</td>
              ))}
              {rowActions ? (
                <td className="adm-row-actions-cell">
                  <details className="adm-row-menu" onClick={(event) => event.stopPropagation()}>
                    <summary className="adm-icon-button" aria-label="Row actions">
                      <MoreHorizontal size={16} />
                    </summary>
                    <div className="adm-row-menu__content">
                      {rowActions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => action.onClick(row)}
                          className="adm-row-menu__item"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </details>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="adm-table-footer">
        <p className="adm-muted">
          Showing {pageRows.length === 0 ? 0 : start + 1}-{start + pageRows.length} of {rows.length}
        </p>
        <div className="adm-pagination">
          <button type="button" className="adm-button adm-button--ghost" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
            Previous
          </button>
          <span className="adm-muted">
            Page {safePage} / {totalPages}
          </span>
          <button
            type="button"
            className="adm-button adm-button--ghost"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
