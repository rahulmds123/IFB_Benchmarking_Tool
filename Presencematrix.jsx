function PresenceBadge({ present }) {
  return present ? (
    <span className="inline-flex w-7 h-7 items-center justify-center rounded-md bg-emerald-500 shadow-sm">
      <i
        className="ti ti-check text-white text-[16px] font-bold"
        aria-hidden="true"
      />
    </span>
  ) : (
    <span className="inline-flex w-7 h-7 items-center justify-center rounded-md bg-red-500 shadow-sm">
      <i
        className="ti ti-x text-white text-[16px] font-bold"
        aria-hidden="true"
      />
    </span>
  )
}

export default function PresenceMatrix({ rows, companies, isLoading }) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-[13px] text-slate-400">
        Loading presence data…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] text-slate-400">
        No component data for this assembly yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide py-2.5 px-4">
              Component
            </th>

            {companies.map((c) => (
              <th
                key={c}
                className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide py-2.5 px-3"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.component}
              className="row-stagger border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <td className="py-2.5 px-4 text-[13px] font-medium text-slate-900">
                {row.component}
              </td>

              {companies.map((c) => (
                <td key={c} className="text-center py-2.5 px-3">
                  <PresenceBadge present={row.presence[c] === 1} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}