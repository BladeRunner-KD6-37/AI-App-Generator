interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: string;
  isLoading?: boolean;
}

export default function StatCard({
  title,
  value,
  description,
  icon,
  isLoading = false,
}: StatCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {isLoading ? (
        <div className="space-y-4">
          <div className="h-6 w-20 rounded-full bg-slate-200" />
          <div className="h-12 w-24 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded-full bg-slate-200" />
        </div>
      ) : (
        <div className="space-y-3">
          {icon ? (
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
              {icon}
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{title}</p>
            <p className="text-3xl font-semibold text-slate-900">{value}</p>
            {description ? (
              <p className="text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
