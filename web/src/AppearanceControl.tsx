import { useEffect, useState } from 'react'

type Appearance = 'system' | 'light' | 'dark'
const storageKey = 'tokenscope-appearance'
const ORDER: Appearance[] = ['system', 'light', 'dark']
const LABELS: Record<Appearance, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

function savedAppearance(): Appearance {
  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function AppearanceControl() {
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance)

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const theme = appearance === 'system' ? (system.matches ? 'dark' : 'light') : appearance
      const root = document.documentElement
      root.dataset.theme = theme
      root.classList.toggle('dark', theme === 'dark')
      root.style.colorScheme = theme
    }

    applyTheme()
    system.addEventListener('change', applyTheme)
    return () => system.removeEventListener('change', applyTheme)
  }, [appearance])

  useEffect(() => {
    const syncPreference = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setAppearance(savedAppearance())
    }
    window.addEventListener('storage', syncPreference)
    return () => window.removeEventListener('storage', syncPreference)
  }, [])

  const changeAppearance = (next: Appearance) => {
    setAppearance(next)
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
      // The selected appearance still works when browser storage is unavailable.
    }
  }

  const next = ORDER[(ORDER.indexOf(appearance) + 1) % ORDER.length]!
  return <button type="button" className="icon-button swap-toggle" data-mode={appearance} onClick={() => changeAppearance(next)} aria-label={`Theme: ${LABELS[appearance]}. Switch to ${LABELS[next]}`} title={`Theme: ${LABELS[appearance]}`}>
    <span className="swap-icon" data-for="system"><svg {...icon}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg></span>
    <span className="swap-icon" data-for="light"><svg {...icon}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg></span>
    <span className="swap-icon" data-for="dark"><svg {...icon}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg></span>
  </button>
}
