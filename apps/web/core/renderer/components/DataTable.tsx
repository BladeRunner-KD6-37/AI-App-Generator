interface DataTableProps {
  entity: string;
  fields: string[];
  data: Record<string, unknown>[];
  isLoading: boolean;
  onDelete?: (id: string) => void;
  onEdit?: (row: Record<string, unknown>) => void;
  title?: string;
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return date.toLocaleString();
    }

    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "–";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function renderCell(value: unknown): React.ReactNode {
  if (typeof value === "boolean") {
    return (
      <span
        className={
          value
            ? "inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
            : "inline-flex items-center rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
        }
      >
        {value ? "✓" : "✕"}
      </span>
    );
  }

  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return date.toLocaleString();
    }
  }

  return <span>{formatValue(value)}</span>;
}

export default function DataTable({
  entity,
  fields,
  data,
  isLoading,
  onDelete,
  onEdit,
  title,
}: DataTableProps) {
  const columns = ["id", ...fields.filter((field) => field !== "id" && field !== "createdAt"), "createdAt"];
  const hasActions = Boolean(onDelete || onEdit);

  return (
    <div className="space-y-4">
      {title ? <h2 className="text-xl font-semibold text-slate-900">{title}</h2> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-slate-600"
                >
                  {column}
                </th>
              ))}
              {hasActions ? (
                <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-slate-600">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 bg-white">
            {isLoading
              ? Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="animate-pulse">
                    {columns.map((column) => (
                      <td key={column} className="px-4 py-4">
                        <div className="h-4 rounded bg-slate-200"></div>
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="px-4 py-4">
                        <div className="h-4 w-24 rounded bg-slate-200"></div>
                      </td>
                    ) : null}
                  </tr>
                ))
              : data.length > 0
              ? data.map((row, rowIndex) => (
                  <tr key={String(row.id ?? rowIndex)} className="hover:bg-slate-50">
                    {columns.map((column) => (
                      <td key={column} className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                        {renderCell(row[column])}
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                        <div className="flex gap-2">
                          {onEdit ? (
                            <button
                              type="button"
                              className="rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                              onClick={() => onEdit(row)}
                            >
                              Edit
                            </button>
                          ) : null}
                          {onDelete ? (
                            <button
                              type="button"
                              className="rounded-md bg-rose-100 px-3 py-1 text-sm font-medium text-rose-700 transition hover:bg-rose-200"
                              onClick={() => {
                                const id = String(row.id ?? "");
                                if (id) {
                                  onDelete(id);
                                }
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-8 text-center text-sm text-slate-500">
                    No records available for {entity}.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
