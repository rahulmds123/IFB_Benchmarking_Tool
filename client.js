import axios from 'axios'

// Point this at your FastAPI backend. Override with VITE_API_BASE_URL in a .env file.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const client = axios.create({
  baseURL: BASE_URL,
})

/**
 * Upload BOM files + company names.
 * Backend returns the normalized ZIP directly as the response body, with the
 * job_id in the `X-Job-ID` response header.
 * @param {File[]} files
 * @param {string[]} companyNames - same order/length as files
 * @param {'washing_machine'|'ac'} [productType]
 * @returns {Promise<{jobId: string, zipBlob: Blob}>}
 */
export async function uploadFiles(files, companyNames, productType = 'washing_machine') {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  companyNames.forEach((name) => formData.append('company_names', name))
  formData.append('product_type', productType)

  const response = await client.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob',
  })

  const jobId = response.headers['x-job-id'] || response.headers['X-Job-ID']
  if (!jobId) {
    throw new Error('Upload succeeded but no job id was returned.')
  }
  return { jobId, zipBlob: response.data }
}

/**
 * Trigger a browser download for the normalized files ZIP returned at upload.
 * @param {Blob} zipBlob
 * @param {string} [filename]
 */
export function downloadZipBlob(zipBlob, filename = 'normalized_files.zip') {
  const url = window.URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Fetch the list of assemblies discovered for a job.
 * Backend returns { assemblies: string[], product_type, assemblies_by_unit? }.
 * assemblies_by_unit is only present for AC jobs — { idu: [...], odu: [...] }.
 * @param {string} jobId
 * @param {string} [unit] - 'IDU' | 'ODU', AC jobs only
 * @returns {Promise<{assemblies: string[], productType: string, assembliesByUnit: {idu: string[], odu: string[]}|null}>}
 */
export async function fetchAssemblies(jobId, unit) {
  const response = await client.get(`/job/${jobId}/assemblies`, {
    params: unit ? { unit } : {},
  })
  return {
    assemblies: response.data.assemblies ?? [],
    productType: response.data.product_type ?? 'washing_machine',
    assembliesByUnit: response.data.assemblies_by_unit ?? null,
  }
}

/**
 * Fetch the presence matrix for a given assembly.
 * Backend returns flat rows: [{ Component: "drum", IFB: 1, Whirlpool: 0, ... }, ...]
 * Transformed here into: [{ component: "drum", presence: { IFB: 1, Whirlpool: 0, ... } }, ...]
 * @param {string} jobId
 * @param {string} assemblyName
 * @returns {Promise<Array<{component: string, presence: Record<string, 0|1>}>>}
 */
export async function fetchPresenceMatrix(jobId, assemblyName, unit) {
  const response = await client.get(`/job/${jobId}/presence-matrix`, {
    params: unit ? { assembly: assemblyName, unit } : { assembly: assemblyName },
  })
  return response.data.map((row) => {
    const { Component, ...rest } = row
    return { component: Component, presence: rest }
  })
}

/**
 * Fetch a multi-component comparison: spec table + rule-based insights + LLM insight.
 * Backend returns flat specs rows (one per company per component), a flat
 * insights array containing "=== COMPONENT ===" section headers mixed with
 * insight lines, and an llm_insight object (structured JSON from the LLM, or
 * {error} if the LLM call failed, or {raw_text, parse_error} if the model
 * didn't return valid JSON).
 *
 * llm_insight's shape depends on analysisMode:
 * - 'detailed' -> component/detailed prompt schema (strengths/weaknesses/
 *   improvement_suggestions per component, or flat for a single component)
 * - 'quick'    -> quick prompt schema (key_points/verdict per component)
 * InsightsPanel detects which one it got automatically, so nothing else
 * downstream needs to know the mode.
 *
 * @param {string} jobId
 * @param {string[]} componentNames
 * @param {'quick'|'detailed'} [analysisMode]
 * @returns {Promise<{groups: Array<{component: string, rows: object[]}>, insightGroups: Record<string, string[]>, llmInsight: object|null}>}
 */
export async function fetchMultiComponent(jobId, componentNames, analysisMode = 'detailed') {
  const response = await client.post(
    `/job/${jobId}/multi-component`,
    componentNames,
    { params: { analysis_mode: analysisMode } }
  )
  const { specs = [], insights = [], llm_insight = null } = response.data

  // group flat spec rows by Component
  const groupsMap = new Map()
  specs.forEach((row) => {
    const { Company, Component, ...specFields } = row
    if (!groupsMap.has(Component)) groupsMap.set(Component, [])
    groupsMap.get(Component).push({ company: Company, ...specFields })
  })
  const groups = Array.from(groupsMap.entries()).map(([component, rows]) => ({
    component,
    rows,
  }))

  // split flat insights into per-component buckets using "=== NAME ===" markers
  // (backend prepends a literal \n before each header, so .trim() is needed)
  const insightGroups = {}
  let currentKey = null
  insights.forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) return
    const headerMatch = /^===\s*(.+?)\s*===$/.exec(line)
    if (headerMatch) {
      currentKey = headerMatch[1].toLowerCase()
      insightGroups[currentKey] = []
    } else if (currentKey) {
      insightGroups[currentKey].push(line)
    }
  })

  return { groups, insightGroups, llmInsight: llm_insight }
}

/**
 * Fetch the top-N heaviest components present across every company for an
 * assembly, with full spec rows for each. Backend filters out any component
 * missing weight data in any company, so this only returns fair cross-brand
 * comparison points.
 * @param {string} jobId
 * @param {string} assemblyName
 * @param {number} [topN]
 * @returns {Promise<{ranking: Array<{component: string, avg_weight: number, weights_by_company: Record<string, number>}>, groups: Array<{component: string, rows: object[]}>, message: string|null}>}
 */
export async function fetchTopComponents(jobId, assemblyName, topN = 5, unit) {
  const response = await client.get(`/job/${jobId}/top-components`, {
    params: unit ? { assembly: assemblyName, top_n: topN, unit } : { assembly: assemblyName, top_n: topN },
  })
  const { components = [], specs = [], message = null } = response.data

  // group flat spec rows by Component, same shape ComparisonTable already expects
  const groupsMap = new Map()
  specs.forEach((row) => {
    const { Company, Component, ...specFields } = row
    if (!groupsMap.has(Component)) groupsMap.set(Component, [])
    groupsMap.get(Component).push({ company: Company, ...specFields })
  })
  const groups = Array.from(groupsMap.entries()).map(([component, rows]) => ({
    component,
    rows,
  }))

  return { ranking: components, groups, message }
}

/**
 * Download a PDF report. Scope controls which sections the backend builds:
 * - 'full'   -> presence matrix + top-N ranking + specs + LLM analysis
 * - 'specs'  -> top-N ranking + specs table only, no LLM call is made at all
 * - 'matrix' -> presence matrix only, no ranking/specs/LLM
 * Triggers a browser download directly — nothing to display inline.
 * @param {string} jobId
 * @param {string} assemblyName
 * @param {number} [topN]
 * @param {'quick'|'detailed'} [analysisMode]
 * @param {'full'|'specs'|'matrix'} [reportScope]
 */
export async function downloadReportPdf(jobId, assemblyName, topN = 5, analysisMode = 'quick', reportScope = 'full', unit) {
  const params = { assembly: assemblyName, top_n: topN, analysis_mode: analysisMode, report_scope: reportScope }
  if (unit) params.unit = unit
  const response = await client.get(`/job/${jobId}/report`, {
    params,
    responseType: 'blob',
  })

  const url = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  const safeName = assemblyName.replace(/\s+/g, '_').replace(/\//g, '-')
  link.download = `${safeName}_${reportScope}_report.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Download a PDF report for SPECIFIC components (not just top-N).
 * This passes component names to the backend to generate a report for exactly
 * the selected components.
 * @param {string} jobId
 * @param {string} assemblyName
 * @param {string[]} componentNames - List of specific components to include
 * @param {'quick'|'detailed'} [analysisMode]
 * @param {'full'|'specs'|'matrix'} [reportScope]
 * @param {string} [unit]
 */
export async function downloadReportForComponents(jobId, assemblyName, componentNames, analysisMode = 'quick', reportScope = 'full', unit) {
  const params = { 
    assembly: assemblyName, 
    top_n: componentNames.length, 
    analysis_mode: analysisMode, 
    report_scope: reportScope,
    component_names: componentNames.join(',')  // Pass component names as comma-separated
  }
  if (unit) params.unit = unit
  
  const response = await client.get(`/job/${jobId}/report`, {
    params,
    responseType: 'blob',
  })

  const url = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  const safeName = assemblyName.replace(/\s+/g, '_').replace(/\//g, '-')
  link.download = `${safeName}_${reportScope}_report.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export default client
