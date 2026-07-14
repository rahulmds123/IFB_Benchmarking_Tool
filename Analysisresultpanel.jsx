function StandingBadge({ standing }) {
  if (!standing) return null
  const toneMap = {
    ahead: 'bg-green-50 text-green-700 border-green-200',
    'on par': 'bg-amber-50 text-amber-700 border-amber-200',
    behind: 'bg-red-50 text-red-700 border-red-200',
  }
  const toneClass = toneMap[standing] || 'bg-slate-50 text-slate-500 border-slate-200'
  return (
    <span className={`inline-block font-mono text-[11px] px-2 py-0.5 rounded-md border uppercase ${toneClass}`}>
      {standing}
    </span>
  )
}

function PriorityBadge({ priority }) {
  if (!priority) return null
  const toneMap = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-green-50 text-green-700 border-green-200',
  }
  const toneClass = toneMap[priority] || 'bg-slate-50 text-slate-500 border-slate-200'
  return (
    <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-md border uppercase ${toneClass}`}>
      {priority} priority
    </span>
  )
}

function VerdictBadge({ verdict }) {
  if (!verdict) return null
  const toneMap = {
    'appropriate as-is': 'bg-green-50 text-green-700 border-green-200',
    'worth investigating competitor approach': 'bg-amber-50 text-amber-700 border-amber-200',
    'needs engineering validation': 'bg-amber-50 text-amber-700 border-amber-200',
    'insufficient data': 'bg-slate-50 text-slate-500 border-slate-200',
  }
  const toneClass = toneMap[verdict] || 'bg-slate-50 text-slate-500 border-slate-200'
  return (
    <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded-md border ${toneClass}`}>
      {verdict}
    </span>
  )
}

function ComponentInsightBlock({ data, showComponentLabel }) {
  return (
    <div className="flex flex-col gap-2.5">
      {showComponentLabel && data.component && (
        <p className="text-[13px] font-semibold text-slate-900">{data.component}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <StandingBadge standing={data.ifb_standing} />
        <PriorityBadge priority={data.priority} />
      </div>
      {data.standing_explanation && (
        <p className="text-[13px] text-slate-600 leading-relaxed">{data.standing_explanation}</p>
      )}
      {data.strengths?.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide font-medium">Strengths</p>
          <ul className="flex flex-col gap-1 mt-1">
            {data.strengths.map((s, i) => (
              <li key={i} className="flex gap-1.5 text-[13px] text-slate-600 leading-relaxed">
                <span className="text-green-600 shrink-0">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.weaknesses?.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide font-medium">Weaknesses</p>
          <ul className="flex flex-col gap-2 mt-1">
            {data.weaknesses.map((w, i) => (
              <li key={i} className="text-[13px] text-slate-600 leading-relaxed">
                <p>{w.issue}</p>
                {w.competitor_references?.length > 0 && (
                  <p className="font-mono text-[11px] text-red-500 mt-0.5">
                    vs {w.competitor_references.join('; ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.improvement_suggestions?.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 uppercase tracking-wide font-medium">Suggestions</p>
          <ul className="flex flex-col gap-2.5 mt-1">
            {data.improvement_suggestions.map((s, i) => (
              <li key={i} className="text-[13px] text-slate-600 leading-relaxed">
                <p className="flex gap-1.5">
                  <span className="text-brand shrink-0">→</span>
                  <span className="text-slate-900">{s.change}</span>
                </p>
                {s.expected_benefit && (
                  <p className="mt-1 pl-4 text-slate-500">
                    <span className="text-green-600 font-mono text-[10px] uppercase mr-1">benefit</span>
                    {s.expected_benefit}
                  </p>
                )}
                {s.cost_tradeoff && (
                  <p className="mt-1 pl-4 text-slate-500">
                    <span className="text-amber-600 font-mono text-[10px] uppercase mr-1">cost</span>
                    {s.cost_tradeoff}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.priority_reasoning && (
        <p className="text-[11px] text-slate-400 italic leading-relaxed">{data.priority_reasoning}</p>
      )}
    </div>
  )
}

function QuickComponentBlock({ data, showComponentLabel }) {
  return (
    <div className="flex flex-col gap-1.5">
      {showComponentLabel && data.component && (
        <p className="text-[13px] font-semibold text-slate-900">{data.component}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <StandingBadge standing={data.ifb_standing} />
        <VerdictBadge verdict={data.verdict} />
      </div>
      {data.key_points?.length > 0 && (
        <ul className="flex flex-col gap-1 mt-1">
          {data.key_points.map((p, i) => (
            <li key={i} className="flex gap-1.5 text-[13px] text-slate-600 leading-relaxed">
              <span className="text-slate-300 shrink-0">▸</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function isQuickShape(llmInsight) {
  return Boolean(llmInsight.per_component?.[0]?.key_points)
}

export default function AnalysisResultPanel({ llmInsight }) {
  if (!llmInsight) return null

  if (llmInsight.error) {
    return (
      <p className="text-[13px] text-red-600 leading-relaxed">
        AI analysis unavailable right now ({llmInsight.error}).
      </p>
    )
  }

  if (llmInsight.parse_error) {
    return (
      <p className="text-[13px] text-slate-500 leading-relaxed whitespace-pre-wrap">
        {llmInsight.raw_text}
      </p>
    )
  }

  if (llmInsight.per_component) {
    const quick = isQuickShape(llmInsight)
    return (
      <div className="flex flex-col gap-3">
        {llmInsight._truncated && (
          <p className="text-[11px] text-amber-600 italic">
            Response was cut short — showing {llmInsight.per_component.length} component
            {llmInsight.per_component.length === 1 ? '' : 's'}.
          </p>
        )}
        {llmInsight.overall_summary && (
          <p className="text-[13px] text-slate-600 leading-relaxed">{llmInsight.overall_summary}</p>
        )}
        {llmInsight.per_component.map((item, i) => (
          <div key={i} className="border-t border-slate-100 pt-3">
            {quick
              ? <QuickComponentBlock data={item} showComponentLabel />
              : <ComponentInsightBlock data={item} showComponentLabel />}
          </div>
        ))}
      </div>
    )
  }

  return <ComponentInsightBlock data={llmInsight} showComponentLabel={false} />
}