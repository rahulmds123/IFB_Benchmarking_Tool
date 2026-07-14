export default function NormalizationComplete({ fileCount, jobId, assemblyCount, onDownloadZip, onProceed }) {
  return (
    <div className="border border-slate-200 rounded-xl p-10 text-center">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <i className="ti ti-check text-green-600 text-[26px]" aria-hidden="true" />
      </div>
      <h1 className="text-[22px] font-bold text-slate-900">Normalization Complete</h1>
      <p className="text-[14px] text-slate-500 mt-1.5">
        {fileCount} BOM file{fileCount === 1 ? '' : 's'} processed · {assemblyCount} assembl
        {assemblyCount === 1 ? 'y' : 'ies'} detected
      </p>
      <p className="text-[12px] font-mono text-slate-400 mt-1">Job ID: {jobId?.slice(0, 8)}</p>

      <div className="flex items-center justify-center gap-3 mt-6">
        <button
          onClick={onDownloadZip}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        >
          <i className="ti ti-download text-[16px]" aria-hidden="true" />
          Download Normalized ZIP
        </button>
        <button
          onClick={onProceed}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-brand text-white hover:bg-brand-hover transition-colors"
        >
          Proceed to Analysis
          <i className="ti ti-arrow-right text-[16px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}