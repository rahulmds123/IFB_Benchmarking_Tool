import { useRef, useState } from 'react'

const MAX_FILES = 5

const PRODUCT_TYPES = [
  { value: 'washing_machine', label: 'Washing machine' },
  { value: 'ac', label: 'AC' },
]

export default function FileUploadPanel({ onProcess }) {
  const [entries, setEntries] = useState([]) // [{ id, file, company }]
  const [isDragging, setIsDragging] = useState(false)
  const [productType, setProductType] = useState('washing_machine')
  const inputRef = useRef(null)

  function addFiles(fileList) {
    const incoming = Array.from(fileList).slice(0, MAX_FILES - entries.length)
    const next = incoming.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      company: file.name.replace(/\.(xlsx|xls)$/i, '').slice(0, 40),
    }))
    setEntries((prev) => [...prev, ...next].slice(0, MAX_FILES))
  }

  function updateCompany(id, company) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, company } : e)))
  }

  function removeEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const canProcess = entries.length >= 2 && entries.every((e) => e.company.trim().length > 0)

  function handleProcess() {
    if (!canProcess) return
    onProcess(
      entries.map((e) => e.file),
      entries.map((e) => e.company.trim()),
      productType
    )
  }

  return (
    <div>
      <p className="text-[11px] tracking-wide text-slate-400 font-semibold uppercase mb-1">Step 1</p>
      <h1 className="text-[26px] font-bold text-slate-900 mb-2">Upload BOM Files</h1>
      <p className="text-[14px] text-slate-500 mb-5">
        Upload <span className="text-brand font-medium">IFB</span> and{' '}
        <span className="text-blue-600 font-medium">competitor</span> Excel BOM files. Assign a
        company name to each file, then normalize.
      </p>

      <div className="flex items-center gap-1.5 mb-5">
        {PRODUCT_TYPES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setProductType(opt.value)}
            disabled={entries.length > 0}
            aria-pressed={productType === opt.value}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-md border transition-colors ${
              productType === opt.value
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        className={`cursor-pointer text-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
          isDragging ? 'border-brand bg-red-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
        }`}
      >
        <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
          <i className="ti ti-cloud-upload text-brand text-[20px]" aria-hidden="true" />
        </div>
        <p className="text-[15px] font-semibold text-slate-900">Drag & drop Excel BOM files here</p>
        <p className="text-[12px] text-slate-400 mt-1">
          or click to browse · .xlsx, .xls
          {productType === 'ac' && ' · each file needs an IDU + ODU sheet'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {entries.length > 0 && (
        <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-[11px] tracking-wide text-slate-500 font-semibold uppercase">
              {entries.length} file{entries.length === 1 ? '' : 's'} queued
            </p>
            <button
              onClick={() => setEntries([])}
              className="text-[12px] text-slate-400 hover:text-slate-700"
            >
              Clear all
            </button>
          </div>
          <div>
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0"
              >
                <i className="ti ti-file-spreadsheet text-slate-400 text-[18px] shrink-0" aria-hidden="true" />
                <div className="min-w-0 shrink-0 w-48">
                  <p className="text-[13px] text-slate-900 truncate" title={entry.file.name}>
                    {entry.file.name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {(entry.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <input
                  type="text"
                  value={entry.company}
                  onChange={(e) => updateCompany(entry.id, e.target.value)}
                  placeholder="Company name"
                  className="flex-1 text-[13px]"
                />
                <button
                  onClick={() => removeEntry(entry.id)}
                  aria-label={`Remove ${entry.file.name}`}
                  className="text-slate-300 hover:text-brand shrink-0"
                >
                  <i className="ti ti-x text-[16px]" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-5">
        <p className="text-[12.5px] text-slate-400">
          {entries.length < 2
            ? 'Add at least 2 files to enable normalization'
            : `${entries.length} files ready`}
        </p>
        <button
          onClick={handleProcess}
          disabled={!canProcess}
          className={`px-5 py-2.5 rounded-lg text-[14px] font-semibold transition-colors ${
            canProcess
              ? 'bg-brand text-white hover:bg-brand-hover'
              : 'bg-red-100 text-red-300 cursor-not-allowed'
          }`}
        >
          Normalize
        </button>
      </div>
    </div>
  )
}