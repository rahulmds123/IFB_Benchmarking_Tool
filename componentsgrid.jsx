import { useState } from 'react'

export default function ComponentsGrid({ rows, companies, onSelect, onMultiSelect, selectedComponents = [] }) {
  const [selectionMode, setSelectionMode] = useState(false)
  
  if (rows.length === 0) {
    return <p className="text-[13px] text-slate-400 text-center py-8">No components to show.</p>
  }

  const toggleSelect = (componentName) => {
    if (!onMultiSelect) return
    const newSelection = selectedComponents.includes(componentName)
      ? selectedComponents.filter(c => c !== componentName)
      : [...selectedComponents, componentName]
    onMultiSelect(newSelection)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (selectionMode) {
                setSelectionMode(false)
                onMultiSelect([])
              } else {
                setSelectionMode(true)
              }
            }}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-md border transition-colors ${
              selectionMode ? 'bg-brand text-white border-brand' : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {selectionMode ? 'Cancel selection' : 'Select multiple'}
          </button>
          {selectionMode && selectedComponents.length > 0 && (
            <span className="text-[12px] text-slate-500">
              {selectedComponents.length} selected
            </span>
          )}
        </div>
        {selectionMode && selectedComponents.length > 0 && (
          <button
            onClick={() => {
              onMultiSelect([...selectedComponents])
              setSelectionMode(false)
            }}
            className="flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand-hover"
          >
            <i className="ti ti-sparkles text-[14px]" aria-hidden="true" />
            Analyze selected ({selectedComponents.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((row) => {
          const presentCount = companies.filter((c) => row.presence[c] === 1).length
          const pct = companies.length > 0 ? (presentCount / companies.length) * 100 : 0
          const isSelected = selectedComponents.includes(row.component)

          return (
            <div
              key={row.component}
              onClick={() => {
                if (selectionMode) {
                  toggleSelect(row.component)
                } else {
                  onSelect(row.component)
                }
              }}
              className={`text-left border rounded-xl p-4 transition-all bg-white cursor-pointer ${
                isSelected
                  ? 'border-brand ring-2 ring-brand/30'
                  : selectionMode 
                    ? 'border-slate-200 hover:border-slate-300' 
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Component</p>
                {selectionMode ? (
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-brand border-brand' : 'border-slate-300'
                  }`}>
                    {isSelected && <i className="ti ti-check text-white text-[12px]" aria-hidden="true" />}
                  </div>
                ) : (
                  <i className="ti ti-chevron-right text-slate-300 text-[16px]" aria-hidden="true" />
                )}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
