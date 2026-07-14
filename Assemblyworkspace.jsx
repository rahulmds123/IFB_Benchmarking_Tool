import { useEffect, useState } from 'react'
import {
  fetchPresenceMatrix,
  fetchTopComponents,
  fetchMultiComponent,
  downloadReportPdf,
} from '../api/client'
import PresenceMatrix from './PresenceMatrix'
import ComponentsGrid from './ComponentsGrid'
import ComponentDetailModal from './ComponentDetailModal'
import AnalysisResultPanel from './AnalysisResultPanel'

export default function AssemblyWorkspace({ jobId, companyLabels, assemblies, assembliesByUnit, productType, zipBlob, onDownloadZip }) {
  const isAc = productType === 'ac' && assembliesByUnit
  const [unit, setUnit] = useState(isAc ? 'idu' : null)

  const assemblyOptions = isAc ? (assembliesByUnit[unit] || []) : assemblies
  const [selectedAssembly, setSelectedAssembly] = useState(assemblyOptions[0] ?? null)
  const [matrixRows, setMatrixRows] = useState([])
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(false)

  const [importantOnly, setImportantOnly] = useState(false)
  const [importantNames, setImportantNames] = useState([])
  const [isLoadingImportant, setIsLoadingImportant] = useState(false)

  const [analysisMode, setAnalysisMode] = useState('quick')
  const [reportScope, setReportScope] = useState('full')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [error, setError] = useState(null)

  const [selectedComponent, setSelectedComponent] = useState(null)

  const companies = matrixRows.length > 0 ? Object.keys(matrixRows[0].presence) : []

  const apiUnit = isAc ? unit.toUpperCase() : undefined

  useEffect(() => {
    if (!isAc) return
    const options = assembliesByUnit[unit] || []
    setSelectedAssembly(options[0] ?? null)
  }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedAssembly) return
    setIsLoadingMatrix(true)
    setBulkResult(null)
    setImportantOnly(false)
    setError(null)
    fetchPresenceMatrix(jobId, selectedAssembly, apiUnit)
      .then(setMatrixRows)
      .catch((err) => setError(err.message || 'Could not load the presence matrix.'))
      .finally(() => setIsLoadingMatrix(false))
  }, [jobId, selectedAssembly, apiUnit])

  useEffect(() => {
    if (!selectedAssembly) return
    setIsLoadingImportant(true)
    fetchTopComponents(jobId, selectedAssembly, 5, apiUnit)
      .then((data) => setImportantNames((data.ranking || []).map((r) => r.component)))
      .catch(() => setImportantNames([]))
      .finally(() => setIsLoadingImportant(false))
  }, [jobId, selectedAssembly, apiUnit])

  const visibleRows = importantOnly
    ? matrixRows.filter((r) => importantNames.includes(r.component))
    : matrixRows

  async function handleAnalyzeImportant() {
    if (importantNames.length === 0) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const data = await fetchMultiComponent(jobId, importantNames, analysisMode)
      setBulkResult(data.llmInsight)
    } catch (err) {
      setError(err.message || 'Could not run the analysis.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleDownloadReport() {
    setIsDownloading(true)
    setError(null)
    try {
      await downloadReportPdf(jobId, selectedAssembly, importantNames.length || 5, analysisMode, reportScope, apiUnit)
    } catch (err) {
      let message = 'Could not generate the report.'
      if (err.response?.data instanceof Blob) {
        try {
          const parsed = JSON.parse(await err.response.data.text())
          if (parsed.error) message = parsed.error
        } catch {
          // fall back to default message
        }
      } else if (err.message) {
        message = err.message
      }
      setError(message)
    } finally {
      setIsDownloading(false)
    }
  }

  if (!isAc && !selectedAssembly) {
    return <p className="text-[13px] text-slate-400 text-center py-8">No assemblies detected.</p>
  }

  return (
    <div>
      <p className="text-[11px] tracking-wide text-amber-600 font-semibold uppercase mb-1">
        Analysis workspace
      </p>
      <h1 className="text-[26px] font-bold text-slate-900 mb-1.5">BOM Benchmarking</h1>
      <p className="text-[13px] text-slate-500 mb-5">
        {companyLabels.length} companies · {companyLabels.join(' / ')}
      </p>

      <button
        onClick={onDownloadZip}
        disabled={!zipBlob}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors mb-6 disabled:opacity-50"
      >
        <i className="ti ti-download text-[15px]" aria-hidden="true" />
        Download Normalized ZIP
      </button>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="border border-slate-200 rounded-xl p-5 mb-6">
        {isAc && (
          <div className="mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <i className="ti ti-air-conditioning text-slate-400 text-[15px]" aria-hidden="true" />
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Unit</p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {[
                { value: 'idu', label: `Indoor unit (${(assembliesByUnit.idu || []).length})` },
                { value: 'odu', label: `Outdoor unit (${(assembliesByUnit.odu || []).length})` },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setUnit(opt.value)}
                  className={`text-[12px] font-medium px-3.5 py-1.5 transition-colors ${
                    unit === opt.value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <i className="ti ti-stack-2 text-slate-400 text-[15px]" aria-hidden="true" />
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Assembly</p>
        </div>
        {assemblyOptions.length === 0 ? (
          <p className="text-[13px] text-slate-400">No assemblies in this unit.</p>
        ) : (
          <select
            value={selectedAssembly ?? ''}
            onChange={(e) => setSelectedAssembly(e.target.value)}
            className="w-full sm:w-auto min-w-[240px] text-[14px] font-medium"
          >
            {assemblyOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2.5 mt-4 cursor-pointer w-fit">
          <span
            role="switch"
            aria-checked={importantOnly}
            onClick={() => setImportantOnly((v) => !v)}
            className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
              importantOnly ? 'bg-brand' : 'bg-slate-200'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                importantOnly ? 'translate-x-4.5 left-0.5' : 'left-0.5'
              }`}
            />
          </span>
          <span className="text-[13px] text-slate-700">
            Show important components only{' '}
            <span className="text-slate-400">
              ({isLoadingImportant ? '…' : importantNames.length} important / {matrixRows.length} total)
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {['quick', 'detailed'].map((mode) => (
              <button
                key={mode}
                onClick={() => setAnalysisMode(mode)}
                className={`text-[12px] font-medium px-3 py-1.5 capitalize transition-colors ${
                  analysisMode === mode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={handleAnalyzeImportant}
            disabled={isAnalyzing || importantNames.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          >
            <i className="ti ti-sparkles text-[15px]" aria-hidden="true" />
            {isAnalyzing ? 'Analyzing…' : `Analyze ${importantNames.length || ''} important components`}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
          <select
            value={reportScope}
            onChange={(e) => setReportScope(e.target.value)}
            className="text-[12px]"
          >
            <option value="full">Full report (matrix + specs + analysis)</option>
            <option value="specs">Specs table only (no analysis)</option>
            <option value="matrix">Presence matrix only</option>
          </select>
          <button
            onClick={handleDownloadReport}
            disabled={isDownloading || !selectedAssembly}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <i className="ti ti-file-download text-[15px]" aria-hidden="true" />
            {isDownloading ? 'Building…' : 'Download PDF report'}
          </button>
        </div>
      </div>

      {bulkResult && (
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center gap-1.5 px-5 py-3 bg-slate-900">
            <i className="ti ti-sparkles text-white text-[14px]" aria-hidden="true" />
            <p className="text-[11px] font-semibold text-white uppercase tracking-wide">
              AI insights · Engineering analysis · {analysisMode}
            </p>
          </div>
          <div className="p-5">
            <AnalysisResultPanel llmInsight={bulkResult} />
          </div>
        </div>
      )}

      <p className="text-[11px] tracking-wide text-amber-600 font-semibold uppercase mb-1">Step 4</p>
      <h2 className="text-[19px] font-bold text-slate-900 mb-1">Presence Matrix</h2>
      <p className="text-[13px] text-slate-400 mb-3">Which parts each company reports for this assembly</p>
      <div className="mb-8">
        <PresenceMatrix rows={visibleRows} companies={companies} isLoading={isLoadingMatrix} />
      </div>

      <p className="text-[11px] tracking-wide text-amber-600 font-semibold uppercase mb-1">Step 5</p>
      <h2 className="text-[19px] font-bold text-slate-900 mb-1">Components</h2>
      <p className="text-[13px] text-slate-400 mb-3">
        {importantOnly ? 'Important components in this assembly' : 'All components in this assembly'}
      </p>
      <ComponentsGrid rows={visibleRows} companies={companies} onSelect={setSelectedComponent} />

      {selectedComponent && (
        <ComponentDetailModal
          jobId={jobId}
          componentName={selectedComponent}
          assemblyName={selectedAssembly}
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </div>
  )
}