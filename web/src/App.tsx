import { useEffect, useState } from 'react'
import { POLL_MS, usePolling, type Status } from './api'
import { Dashboard, Icon, Setup } from './components'
import { AppearanceControl } from './AppearanceControl'

type Tab = 'dashboard' | 'setup'
const TABS: { key: Tab; title: string }[] = [
  { key: 'dashboard', title: 'Usage' },
  { key: 'setup', title: 'Setup' },
]
const glyph = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
const initialTab = (): Tab => {
  const hash = window.location.hash.replace('#', '')
  return TABS.find(t => t.key === hash)?.key ?? 'dashboard'
}

export default function App({ onSignOut }: { onSignOut?: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [privacy, setPrivacy] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const status = usePolling<Status>('/api/status', POLL_MS, refreshKey)
  const navigate = (next: Tab) => { setTab(next); window.location.hash = next; window.scrollTo({ top: 0, behavior: 'instant' }) }
  useEffect(() => {
    const onHashChange = () => setTab(initialTab())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const apiDown = !status.loading && (status.error !== null || status.data?.database.connected === false)

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <button className="brand" onClick={() => navigate('dashboard')} aria-label="TokenScope, go to usage"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Token<span className="brand-light">Scope</span></span></button>
      <nav className="nav" aria-label="Main">{TABS.map(item => <button key={item.key} onClick={() => navigate(item.key)} aria-current={tab === item.key ? 'page' : undefined}>{item.title}</button>)}</nav>
      <div className="topbar-actions">
        {apiDown && <span className="connection" role="status"><span className="dot off" /><span>Database unreachable</span></span>}
        <button className="icon-button swap-toggle" data-mode={privacy ? 'hidden' : 'visible'} aria-pressed={privacy} aria-label="Hide names" title={privacy ? 'Names are hidden. Click to show them.' : 'Names are visible. Click to hide them.'} onClick={() => setPrivacy(value => !value)}>
          <span className="swap-icon" data-for="visible"><svg {...glyph}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></span>
          <span className="swap-icon" data-for="hidden"><svg {...glyph}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></svg></span>
        </button>
        <AppearanceControl />
        <button className="icon-button" onClick={() => setRefreshKey(k => k + 1)} aria-label="Refresh data" title="Refresh data"><Icon name="refresh" size={17} /></button>
        {onSignOut && <button className="signout" onClick={onSignOut}>Sign out</button>}
      </div>
    </header>
    <main id="main" tabIndex={-1}>
      {tab === 'dashboard' && <Dashboard refreshKey={refreshKey} privacy={privacy} status={status.data} onSetup={() => navigate('setup')} />}
      {tab === 'setup' && <Setup onView={() => navigate('dashboard')} />}
    </main>
  </>
}
