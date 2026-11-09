import { useCallback, useEffect, useState } from 'react'
import { UNAUTHORIZED_EVENT } from './api'
import App from './App'
import { ErrorNotice } from './components'
import { Login } from './Login'

type State = 'checking' | 'login' | 'ready' | 'unavailable'

export function AuthGate() {
  const [state, setState] = useState<State>('checking')
  const [authRequired, setAuthRequired] = useState(false)

  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/session')
      if (!response.ok) throw new Error('session check failed')
      const session = await response.json() as { authRequired: boolean; authenticated: boolean }
      setAuthRequired(session.authRequired)
      setState(session.authenticated ? 'ready' : 'login')
    } catch {
      setState('unavailable')
    }
  }, [])

  useEffect(() => {
    void check()
    const onUnauthorized = () => setState('login')
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [check])

  const signOut = async () => {
    try { await fetch('/api/logout', { method: 'POST' }) } finally { setState('login') }
  }

  if (state === 'checking') return <div className="login"><div className="loading" role="status"><span className="spinner" />Loading…</div></div>
  if (state === 'unavailable') return <div className="login"><div className="login-form"><ErrorNotice message="The API is unavailable. Check that the server is running." retry={() => { setState('checking'); void check() }} /></div></div>
  if (state === 'login') return <Login onSuccess={() => void check()} />
  return <App onSignOut={authRequired ? signOut : undefined} />
}
