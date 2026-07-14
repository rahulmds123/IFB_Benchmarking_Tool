import { useEffect, useState } from 'react'
import { fetchMultiComponent } from '../api/client'
import AnalysisResultPanel from './AnalysisResultPanel'

function isNA(v) {
  return v === undefined || v === null || v === '' || v === 'NA' || v === 'N/A'
}

export default function ComponentDetailModal({ jobId, componentName, assemblyName, onClose }) {
  const [specs, setSpecs] = useState([])
  const [ruleInsights, setRuleInsights] = useState([])
  const [llmInsight, setLlmInsight] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setShowAnalysis(false)
    setLlmInsight(null)

    fetchMultiComponent(jobId, [componentName], 'detailed')
      .then((data) => {
        if (cancelled) return
        const group = data.groups.find((g) => g.component === componentName)
        setSpecs(group?.rows || [])
        setRuleInsights(data.insightGroups[componentName.toLowerCase()] || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load component details.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [jobId, componentName])

  async function handleLoadAnalysis() {
    if (isAnalyzing || showAnalysis) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const data = await fetchMultiComponent(jobId, [componentName], 'detailed')
      setLlmInsight(data.llmInsight || null)
      setShowAnalysis(true)
    } catch (err) {
      setError(err.message || 'Could not load analysis.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const specColumns = specs.length > 0 ? Object.keys(specs[0]).filter((k) => k !== 'company') : []

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-start justify-center p-4 sm:p-8 overflow-y-auto z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-2xl w-full my-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Component details
            </p>
            <h2 className="text-[20px] font-bold text-slate-900 mt-0.5">{componentName}</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">Assembly: {assemblyName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-brand hover:border-red-200 transition-colors shrink-0"
          >
            <i className="ti ti-x text-[16px]" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-[13px] text-slate-400 text-center py-8">Loading component details…</p>
          ) : error ? (
            <p className="text-[13px] text-red-600 text-center py-8">{error}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Specification comparison
                </p>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-[12.5px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left font-semibold text-slate-400 uppercase text-[10px] tracking-wide py-2 px-3">
                          Company
                        </th>
                        {specColumns.map((col) => (
                          <th
                            key={col}
                            className="text-left font-semibold text-slate-400 uppercase text-[10px] tracking-wide py-2 px-3"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {specs.map((row) => (
                        <tr key={row.company} className="border-t border-slate-100">
                          <td className="py-2 px-3 font-medium text-slate-900">{row.company}</td>
                          {specColumns.map((col) => (
                            <td
                              key={col}
                              className={`py-2 px-3 ${isNA(row[col]) ? 'text-slate-300' : 'text-slate-700'}`}
                            >
                              {isNA(row[col]) ? '—' : row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Highlights specs that differ across companies</p>
              </div>

              {ruleInsights.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <i className="ti ti-list-check text-slate-400 text-[14px]" aria-hidden="true" />
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Rule-based insights
                    </p>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {ruleInsights.map((text, i) => (
                      <li key={i} className="flex gap-1.5 text-[12.5px] text-slate-600 leading-relaxed">
                        <span className="text-slate-300 shrink-0">›</span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <i className="ti ti-sparkles text-slate-400 text-[14px]" aria-hidden="true" />
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      AI insights · Engineering analysis
                    </p>
                  </div>
                  {!showAnalysis && !isAnalyzing && (
                    <button
                      onClick={handleLoadAnalysis}
                      className="text-[12px] font-medium text-brand hover:text-brand-hover"
                    >
                      Analyze
                    </button>
                  )}
                  {isAnalyzing && (
                    <span className="text-[12px] text-slate-400">Loading…</span>
                  )}
                </div>
                <div className="p-4">
                  {showAnalysis && llmInsight ? (
                    <AnalysisResultPanel llmInsight={llmInsight} />
                  ) : isAnalyzing ? (
                    <p className="text-[13px] text-slate-400 text-center py-4">Analyzing component…</p>
                  ) : (
                    <p className="text-[13px] text-slate-400 text-center py-4">
                      Click "Analyze" to generate AI insights for this component.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
