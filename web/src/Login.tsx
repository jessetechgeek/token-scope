import { useEffect, useRef, useState, type FormEvent } from 'react'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (response.ok) {
        onSuccess()
        return
      }
      setError(response.status === 401 ? 'That password is incorrect. Check it and try again.'
        : response.status === 503 ? 'Sign-in is not set up on the server yet. Set TOKENSCOPE_API_TOKEN and redeploy.'
        : 'Sign-in failed. Try again in a moment.')
      setPassword('')
      input.current?.focus()
    } catch {
      setError('Cannot reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login">
    <form className="login-form" onSubmit={submit} aria-busy={busy}>
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Token<span className="brand-light">Scope</span></span></div>
      <h1>Sign in</h1>
      <p className="login-lede">Enter your access password to see your Claude Code usage.</p>
      <input className="hidden-field" type="text" name="username" autoComplete="username" value="tokenscope" readOnly tabIndex={-1} aria-hidden="true" />
      <div className="field">
        <label htmlFor="login-password">Password</label>
        <div className="field-wrap">
          <input id="login-password" ref={input} className="input" type={reveal ? 'text' : 'password'} name="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={password} onChange={event => setPassword(event.target.value)} aria-invalid={error !== null} aria-describedby={error ? 'login-error' : undefined} disabled={busy} />
          <button type="button" className="reveal" onClick={() => setReveal(value => !value)} aria-pressed={reveal}>{reveal ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      <div aria-live="polite">{error && <div id="login-error" className="notice error" role="alert">{error}</div>}</div>
      <button type="submit" className="button primary" disabled={busy || !password}>{busy ? <><span className="spinner" />Signing in…</> : 'Sign in'}</button>
      <p className="login-foot">Costs shown are estimates, not billing data.</p>
    </form>
  </main>
}
