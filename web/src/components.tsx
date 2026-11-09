import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Select } from './Select'
import {
  FAMILY_LABELS, MODEL_FAMILIES, POLL_MS, RANGE_SECONDS, ago, alias, compact, familyOf, number, pivotByFamily, usd, usePolling,
  type ChartMetric, type Live, type Range, type Resource, type Session, type Slice, type Status, type Summary, type Timeseries,
} from './api'

export type IconName = 'shield' | 'arrow' | 'refresh' | 'check' | 'copy' | 'activity'
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>,
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const RANGES: Range[] = ['1h', '24h', '7d', '30d', '90d']
const RANGE_TEXT: Record<Range, string> = { '1h': 'the last hour', '24h': 'the last 24 hours', '7d': 'the last 7 days', '30d': 'the last 30 days', '90d': 'the last 90 days' }
const familyColor = (family: string) => `var(--s-${family})`

const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', boxShadow: 'none' },
  labelStyle: { color: 'var(--ink-3)', marginBottom: 6 },
  itemStyle: { color: 'var(--ink)' },
}
const axisTick = { fill: 'var(--ink-3)', fontSize: 12 }
const formatTick = (range: Range) => (t: number) => {
  const d = new Date(t)
  if (range === '1h' || range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (range === '7d') return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice error" role="alert"><span>{message}</span>{retry && <button className="text-button" onClick={retry}>Try again</button>}</div>
}
function Loading({ label = 'Loading usage…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" />{label}</div>
}
function ResourceState<T>({ resource, empty, emptyText, children }: { resource: Resource<T>; empty?: boolean; emptyText: string; children: ReactNode }) {
  if (resource.loading && !resource.data) return <Loading />
  if (resource.error && !resource.data) return <ErrorNotice message={resource.error} retry={resource.retry} />
  if (empty) return <p className="muted">{emptyText}</p>
  return <>{resource.error && <ErrorNotice message={`Showing the last response. ${resource.error}`} retry={resource.retry} />}{children}</>
}

function Money({ micros }: { micros: number }) {
  const [whole, cents] = usd(micros).split('.')
  return <>{whole}<span className="cents">.{cents}</span></>
}

type ChartProps = { series?: Timeseries; range: Range; metric: ChartMetric }
const SpendChart = lazy(async () => {
  const { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } = await import('recharts')
  return { default: function SpendChart({ series, range, metric }: ChartProps) {
    const data = series ? pivotByFamily(series.points, series.bucketSeconds, RANGE_SECONDS[range], metric) : []
    const present = MODEL_FAMILIES.filter(f => series?.points.some(p => familyOf(p.model) === f))
    return <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={formatTick(range)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={36} />
        <YAxis tickFormatter={v => `${metric === 'cost' ? '$' : ''}${compact(Number(v))}`} allowDecimals={metric === 'cost'} tick={axisTick} axisLine={false} tickLine={false} width={56} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--line-strong)' }} labelFormatter={t => new Date(Number(t)).toLocaleString()} formatter={(v, name) => [metric === 'cost' ? usd(Number(v) * 1_000_000) : number(Number(v)), FAMILY_LABELS[name as keyof typeof FAMILY_LABELS] ?? String(name)]} />
        {present.map(f => <Area key={f} type="monotone" dataKey={f} stackId="usage" stroke={familyColor(f)} fill={familyColor(f)} fillOpacity={0.55} strokeWidth={2} isAnimationActive={false} />)}
      </AreaChart>
    </ResponsiveContainer>
  } }
})

const ActivityChart = lazy(async () => {
  const { Bar, BarChart, ResponsiveContainer, Tooltip } = await import('recharts')
  return { default: function ActivityChart({ minutes, metric }: { minutes: Record<string, number>[]; metric: ChartMetric }) {
    return <ResponsiveContainer width="100%" height="100%">
      <BarChart data={minutes} barCategoryGap={2}>
        <Tooltip {...tooltipStyle} cursor={{ fill: 'var(--grid)' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.t ? formatTick('1h')(Number(payload[0].payload.t)) : ''} formatter={(v, name) => [metric === 'cost' ? usd(Number(v) * 1_000_000) : number(Number(v)), FAMILY_LABELS[name as keyof typeof FAMILY_LABELS] ?? String(name)]} />
        {MODEL_FAMILIES.map(f => <Bar key={f} dataKey={f} stackId="usage" fill={familyColor(f)} radius={[2, 2, 0, 0]} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer>
  } }
})

const DIMENSIONS = [
  { key: 'model', label: 'Model', alias: 'Model' }, { key: 'agent', label: 'Subagent', alias: 'Agent' }, { key: 'skill', label: 'Skill', alias: 'Skill' },
  { key: 'mcp', label: 'MCP server', alias: 'MCP' }, { key: 'developer', label: 'Developer', alias: 'Developer' }, { key: 'query', label: 'Request type', alias: 'Request type' },
] as const

function costText(row: { costUsdMicros: number; requests: number; pricedRequests?: number }, allUnpriced: boolean) {
  return row.requests > 0 && (allUnpriced || row.pricedRequests === 0) ? 'Unpriced' : usd(row.costUsdMicros)
}

function Breakdown({ range, refreshKey, privacy, allUnpriced }: { range: Range; refreshKey: number; privacy: boolean; allUnpriced: boolean }) {
  const [by, setBy] = useState<(typeof DIMENSIONS)[number]['key']>('model')
  const dimension = DIMENSIONS.find(d => d.key === by)!
  const data = usePolling<Slice[]>(`/api/breakdown?source=live&range=${range}&by=${by}&metric=${allUnpriced ? 'requests' : 'cost'}`, POLL_MS, refreshKey)
  const max = Math.max(1, ...(data.data ?? []).map(s => allUnpriced ? s.requests : s.costUsdMicros))
  return <section className="section" aria-labelledby="breakdown-title">
    <div className="section-head">
      <div><h2 id="breakdown-title">Spend by {dimension.label.toLowerCase()}</h2><p>{allUnpriced ? 'Ranked by requests' : 'Ranked by estimated cost'}, top 8</p></div>
      <Select label="Group spend by" align="end" value={by} onChange={setBy} options={DIMENSIONS.map(d => ({ value: d.key, label: d.label }))} />
    </div>
    <ResourceState resource={data} empty={data.data?.length === 0} emptyText="Nothing to group in this range.">
      <ol className="rows">{data.data?.map(s => <li className="row" key={s.label}>
        <span className="row-name">{by === 'model' ? s.label : alias(s.label, dimension.alias, privacy)}</span>
        <span className="row-value">{allUnpriced ? number(s.requests) : costText(s, false)}</span>
        <span className="row-meta"><span className="bar" aria-hidden="true"><i style={{ width: `${((allUnpriced ? s.requests : s.costUsdMicros) / max) * 100}%`, background: by === 'model' ? familyColor(familyOf(s.label)) : undefined }} /></span><span>{number(s.requests)} requests{!allUnpriced && (s.unpricedRequests ?? 0) > 0 ? `, ${number(s.unpricedRequests!)} unpriced` : ''}</span></span>
      </li>)}</ol>
    </ResourceState>
  </section>
}

function Sessions({ range, refreshKey, privacy, allUnpriced }: { range: Range; refreshKey: number; privacy: boolean; allUnpriced: boolean }) {
  const sessions = usePolling<Session[]>(`/api/sessions?source=live&range=${range}&metric=${allUnpriced ? 'requests' : 'cost'}`, POLL_MS, refreshKey)
  return <section className="section" aria-labelledby="sessions-title">
    <div className="section-head"><div><h2 id="sessions-title">{allUnpriced ? 'Busiest sessions' : 'Costliest sessions'}</h2><p>{privacy ? 'Names are hidden. Turn off Hide names to see them.' : 'Showing original session and developer names.'}</p></div></div>
    <ResourceState resource={sessions} empty={sessions.data?.length === 0} emptyText="No sessions in this range.">
      <div className="table-wrap"><table>
        <thead><tr><th>Session</th><th>Developer</th><th>Started</th><th className="num">Requests</th><th className="num">Cost</th></tr></thead>
        <tbody>{sessions.data?.map(s => <tr key={`${s.sessionId}:${s.developer}`}>
          <td>{alias(s.sessionId, 'Session', privacy)}</td><td>{alias(s.developer, 'Developer', privacy)}</td>
          <td>{new Date(s.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td><td className="num">{number(s.requests)}</td>
          <td className="num">{costText(s, allUnpriced)}{!allUnpriced && (s.unpricedRequests ?? 0) > 0 && s.pricedRequests !== 0 && <span className="sub">partly unpriced</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </ResourceState>
  </section>
}

function RightNow({ live }: { live: Resource<Live> }) {
  const data = live.data
  const unpriced = (data?.today.requests ?? 0) > 0 && data?.today.pricedRequests === 0
  const metric: ChartMetric = unpriced ? 'requests' : 'cost'
  const minutes = data ? pivotByFamily(data.minutes, 60, 3600, metric) : []
  return <section className="section" aria-labelledby="now-title">
    <div className="section-head"><div><h2 id="now-title">Today and the last hour</h2><p>Days run on UTC.</p></div></div>
    <ResourceState resource={live} emptyText="">
      <div className="activity">
        <div>
          <p className="activity-figure">{unpriced ? 'Unpriced' : usd(data?.today.costUsdMicros ?? 0)}</p>
          <p className="muted">{number(data?.today.requests ?? 0)} requests today</p>
        </div>
        <div className="activity-spark" role="img" aria-label={`${metric === 'cost' ? 'Estimated cost' : 'Requests'} per minute over the last hour`}>
          {data && data.minutes.length > 0
            ? <Suspense fallback={<Loading label="" />}><ActivityChart minutes={minutes} metric={metric} /></Suspense>
            : <p className="muted">No requests in the last hour.</p>}
        </div>
      </div>
    </ResourceState>
  </section>
}

export function Dashboard({ refreshKey, privacy, status, onSetup }: { refreshKey: number; privacy: boolean; status?: Status; onSetup: () => void }) {
  const [range, setRange] = useState<Range>('30d')
  const [metric, setMetric] = useState<ChartMetric>('cost')
  const summary = usePolling<Summary>(`/api/summary?source=live&range=${range}`, POLL_MS, refreshKey)
  const series = usePolling<Timeseries>(`/api/timeseries?source=live&range=${range}`, POLL_MS, refreshKey)
  const live = usePolling<Live>('/api/live?source=live', POLL_MS, refreshKey)
  const t = summary.data?.totals
  const allUnpriced = (t?.requests ?? 0) > 0 && summary.data?.pricedRequests === 0
  const effectiveMetric: ChartMetric = allUnpriced ? 'requests' : metric
  const inputTokens = t ? t.inputTokens + t.cacheReadTokens + t.cacheCreationTokens : 0
  const cacheHit = inputTokens > 0 ? (t!.cacheReadTokens / inputTokens) * 100 : 0
  const lastEvent = live.data?.lastEventAt ?? status?.sources.find(s => s.source === 'live')?.lastEventAt ?? null
  const recent = !!lastEvent && Date.now() - new Date(lastEvent).getTime() < 5 * 60_000
  const present = MODEL_FAMILIES.filter(f => series.data?.points.some(p => familyOf(p.model) === f))
  const unpricedCount = summary.data?.unpricedRequests ?? 0

  const head = <div className="page-head">
    <div><h1>Usage</h1><p>Claude Code spend from live telemetry.</p></div>
    <div className="head-tools">
      <span className="connection" role="status"><span className={`dot ${recent ? 'on' : ''}`} /><span>{lastEvent ? (recent ? `Receiving data, last request ${ago(lastEvent)}` : `Last request ${ago(lastEvent)}`) : 'No requests yet'}</span></span>
      <div className="segmented" role="group" aria-label="Time range">{RANGES.map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}</div>
    </div>
  </div>

  if (t?.requests === 0 && !summary.error) {
    return <>{head}<section className="empty"><h2>No requests in {RANGE_TEXT[range]}</h2><p>Start Claude Code with your telemetry settings and send a request. It shows up here within a minute. Or choose a wider range.</p><button className="button primary" onClick={onSetup}>Set up telemetry <Icon name="arrow" size={16} /></button></section></>
  }

  return <>
    {head}
    {summary.error && <div className="stack"><ErrorNotice message={summary.data ? `Showing the last response. ${summary.error}` : summary.error} retry={summary.retry} /></div>}
    <section className="hero" aria-labelledby="hero-label">
      <div>
        <p className="hero-label" id="hero-label">Estimated spend over {RANGE_TEXT[range]}</p>
        <p className="hero-number">{!t ? '—' : allUnpriced ? 'Unpriced' : <Money micros={t.costUsdMicros} />}</p>
        <p className="hero-note">Estimated from API prices. This is not your subscription bill.</p>
      </div>
      <dl className="facts">
        <div><dt>Requests</dt><dd>{t ? compact(t.requests) : '—'}</dd></div>
        <div><dt>Input tokens</dt><dd>{t ? compact(inputTokens) : '—'}</dd><small>with cache</small></div>
        <div><dt>Output tokens</dt><dd>{t ? compact(t.outputTokens) : '—'}</dd></div>
        <div><dt>Cache hits</dt><dd>{t ? `${cacheHit.toFixed(0)}%` : '—'}</dd><small>of input</small></div>
      </dl>
    </section>
    {unpricedCount > 0 && <div className="stack" style={{ marginTop: 24 }}><div className="notice warn">{number(unpricedCount)} requests have no known price. {allUnpriced ? 'Token counts are still shown.' : 'The total counts known costs only.'}</div></div>}

    <section className="section" aria-labelledby="over-time-title">
      <div className="section-head">
        <div><h2 id="over-time-title">{effectiveMetric === 'cost' ? 'Spend' : 'Requests'} over time</h2>
          <div className="legend" aria-label="Model colors" style={{ marginTop: 8 }}>{present.map(f => <span key={f}><i style={{ background: familyColor(f) }} />{FAMILY_LABELS[f]}</span>)}</div></div>
        <div className="segmented" role="group" aria-label="Chart measure"><button aria-pressed={effectiveMetric === 'cost'} disabled={allUnpriced} onClick={() => setMetric('cost')}>Cost</button><button aria-pressed={effectiveMetric === 'requests'} onClick={() => setMetric('requests')}>Requests</button></div>
      </div>
      <div className="chart" role="img" aria-label={`${effectiveMetric === 'cost' ? 'Estimated cost' : 'Requests'} by model over ${RANGE_TEXT[range]}`}>
        <ResourceState resource={series} empty={series.data?.points.length === 0} emptyText="No data in this range.">
          <Suspense fallback={<Loading label="Loading chart…" />}><SpendChart series={series.data} range={range} metric={effectiveMetric} /></Suspense>
        </ResourceState>
      </div>
    </section>

    <div className="two-up">
      <Breakdown range={range} refreshKey={refreshKey} privacy={privacy} allUnpriced={allUnpriced} />
      <Sessions range={range} refreshKey={refreshKey} privacy={privacy} allUnpriced={allUnpriced} />
    </div>
    <RightNow live={live} />
  </>
}

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { setFailed(true) }
  }
  return <div className="copy">
    <header><span>{label}</span><button className="text-button" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy'}</button></header>
    <pre><code>{code}</code></pre>
    {failed && <p className="muted" style={{ padding: '0 14px 12px' }}>Copy is blocked here. Select the text instead.</p>}
  </div>
}

export function Setup({ onView }: { onView: () => void }) {
  const origin = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin
  const configuration = JSON.stringify({ env: {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_TRACES_EXPORTER: 'none',
    OTEL_LOG_USER_PROMPTS: '0',
    OTEL_LOG_ASSISTANT_RESPONSES: '0',
    OTEL_LOG_TOOL_DETAILS: '0',
    OTEL_LOG_TOOL_CONTENT: '0',
    OTEL_LOG_RAW_API_BODIES: '0',
    OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `${origin}/v1/logs`,
    OTEL_EXPORTER_OTLP_LOGS_HEADERS: 'Authorization=Bearer <your access password>',
    OTEL_RESOURCE_ATTRIBUTES: 'developer=<your name>',
  } }, null, 2)
  return <>
    <div className="page-head"><div><h1>Connect Claude Code</h1><p>Send request events from Claude Code to this dashboard. Only usage metadata is stored: model, token counts, session and cost. Prompts, responses and tool contents are never sent.</p></div></div>
    <ol className="steps">
      <li className="step"><span className="step-n" aria-hidden="true">1</span><div className="step-body"><h2>Save your settings file</h2><p>Save this as <code>claude-telemetry.json</code> and replace the two placeholders. Keep the file private, because it contains your access password.</p><CopyBlock label="claude-telemetry.json" code={configuration} /></div></li>
      <li className="step"><span className="step-n" aria-hidden="true">2</span><div className="step-body"><h2>Start a new session with it</h2><p>Settings are read when a session starts, so sessions that are already open won't report.</p><CopyBlock label="Terminal" code="claude --settings ./claude-telemetry.json" /></div></li>
      <li className="step"><span className="step-n" aria-hidden="true">3</span><div className="step-body"><h2>Send a request, then check the dashboard</h2><p>Events arrive after the exporter flushes, usually within a few seconds. The dashboard refreshes about every 30 seconds while you are looking at it.</p><div><button className="button primary" onClick={onView}>Open dashboard <Icon name="arrow" size={16} /></button></div></div></li>
    </ol>
    <p className="fine">Agent, skill and MCP names appear only when Claude Code emits them. Costs use Claude API prices and are estimates.</p>
  </>
}
