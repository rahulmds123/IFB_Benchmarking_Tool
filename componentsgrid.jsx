export default function ComponentsGrid({ rows, companies, onSelect }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-slate-400 text-center py-8">No components to show.</p>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {rows.map((row) => {
        const presentCount = companies.filter((c) => row.presence[c] === 1).length
        const pct = companies.length > 0 ? (presentCount / companies.length) * 100 : 0
        return (
          <button
            key={row.component}
            onClick={() => onSelect(row.component)}
            className="text-left border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all bg-white"
          >
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Component</p>
              <i className="ti ti-chevron-right text-slate-300 text-[16px]" aria-hidden="true" />
            </div>
            <p className="text-[15px] font-semibold text-slate-900 mb-3">{row.component}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full progress-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                {presentCount}/{companies.length}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}