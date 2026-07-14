import { useState } from 'react'
import { uploadFiles, downloadZipBlob, fetchAssemblies } from './api/client'
import FileUploadPanel from './components/FileUploadPanel'
import NormalizationComplete from './components/NormalizationComplete'
import AssemblyWorkspace from './components/AssemblyWorkspace'
import ifb_image from './assets/ifb_image.png'

// Step wizard: 'upload' -> 'normalizing' -> 'complete' -> 'workspace'
// Replaces the old always-visible 3-column dashboard with a guided flow,
// matching the reference: one step fills the screen at a time instead of
// showing upload/matrix/insights simultaneously.

function NavPill({ label, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[13px] font-medium px-3.5 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-slate-900 text-white'
          : disabled
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  )
}

export default function App() {
  const [step, setStep] = useState('upload') // 'upload' | 'normalizing' | 'complete' | 'workspace'
  const [jobId, setJobId] = useState(null)
  const [zipBlob, setZipBlob] = useState(null)
  const [productType, setProductType] = useState('washing_machine')
  const [companyLabels, setCompanyLabels] = useState([]) // display strings for the workspace header
  const [assemblies, setAssemblies] = useState([])
  const [assembliesByUnit, setAssembliesByUnit] = useState(null) // AC jobs only: {idu: [...], odu: [...]}
  const [fileCount, setFileCount] = useState(0)
  const [error, setError] = useState(null)

  async function handleProcess(files, companyNames, selectedProductType) {
    setError(null)
    setStep('normalizing')
    setCompanyLabels(companyNames)
    setFileCount(files.length)
    setProductType(selectedProductType)

    try {
      const {
        jobId: newJobId,
        zipBlob: newZipBlob,
      } = await uploadFiles(files, companyNames, selectedProductType)

      setJobId(newJobId)
      setZipBlob(newZipBlob)

      const {
        assemblies: assemblyList,
        assembliesByUnit: byUnit,
      } = await fetchAssemblies(newJobId)

      setAssemblies(assemblyList)
      setAssembliesByUnit(byUnit)

      setStep('complete')
    } catch (err) {
      setError(
        err.message ||
          'Upload failed. Check the backend connection and try again.'
      )
      setStep('upload')
    }
  }

  function handleDownloadZip() {
    if (zipBlob) downloadZipBlob(zipBlob)
  }

  function handleStartOver() {
    setStep('upload')
    setJobId(null)
    setZipBlob(null)
    setCompanyLabels([])
    setAssemblies([])
    setAssembliesByUnit(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md overflow-hidden shrink-0">
            <img
              src={ifb_image}
              alt="IFB Logo"
              className="w-full h-full object-cover"
            />
          </div>

          <div>
            <p className="text-[14px] font-semibold text-slate-900 leading-tight">
              IFB Benchmarking
            </p>
            <p className="text-[10px] tracking-wide text-slate-400 font-medium leading-tight">
              PRODUCT ENGINEERING TOOL
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <NavPill
            label="Upload"
            active={step === 'upload' || step === 'normalizing'}
            onClick={handleStartOver}
          />

          <NavPill
            label="Downloads"
            active={false}
            disabled={!zipBlob}
            onClick={handleDownloadZip}
          />

          <NavPill
            label="Analysis"
            active={step === 'complete' || step === 'workspace'}
            disabled={!jobId}
            onClick={() => jobId && setStep('workspace')}
          />
        </nav>
      </header>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <main className="max-w-4xl mx-auto px-6 py-8">
        {step === 'upload' && (
          <FileUploadPanel
            onProcess={handleProcess}
            isProcessing={false}
          />
        )}

        {step === 'normalizing' && (
          <div className="border border-slate-200 rounded-xl p-8 text-center">
            <div className="inline-flex w-10 h-10 items-center justify-center">
              <i
                className="ti ti-loader-2 text-brand text-[26px] animate-spin"
                aria-hidden="true"
              />
            </div>

            <p className="text-[16px] font-semibold text-slate-900 mt-3">
              Normalizing BOM files…
            </p>

            <div className="max-w-sm mx-auto mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full progress-fill"
                style={{ width: '85%' }}
              />
            </div>

            <p className="text-[12px] text-slate-400 mt-3">
              Cleaning columns · Building master BOM · Aligning components
              across companies
            </p>
          </div>
        )}

        {step === 'complete' && (
          <NormalizationComplete
            fileCount={fileCount}
            jobId={jobId}
            onDownloadZip={handleDownloadZip}
            onProceed={() => setStep('workspace')}
            assemblyCount={assemblies.length}
          />
        )}

        {step === 'workspace' && jobId && (
          <AssemblyWorkspace
            jobId={jobId}
            companyLabels={companyLabels}
            assemblies={assemblies}
            assembliesByUnit={assembliesByUnit}
            productType={productType}
            zipBlob={zipBlob}
            onDownloadZip={handleDownloadZip}
          />
        )}
      </main>
    </div>
  )
}