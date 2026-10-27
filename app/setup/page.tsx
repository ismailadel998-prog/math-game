'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button, Header } from '@/components/ui'

export default function Setup() {
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function run() {
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/admin/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode }) })
      const data = await res.json().catch(() => ({}))
      setResult(res.ok ? { ok: true, text: `Done! Applied: ${(data.applied as string[]).join(', ')}` } : { ok: false, text: data.message ?? 'Something went wrong.' })
    } catch { setResult({ ok: false, text: 'Connection problem. Try again.' }) }
    setBusy(false)
  }

  return (
    <div className="page lobby-page">
      <Header right={<Link className="btn btn-ghost btn-link" href="/teacher">Teacher</Link>} />
      <main className="lobby-main" style={{ gridTemplateColumns: 'minmax(0,560px)', justifyContent: 'center' }}>
        <section className="join-card">
          <div className="card-kicker">ONE-TIME SETUP</div>
          <div className="card-title" role="heading" aria-level={2}>Update the database</div>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Creates or updates the game&apos;s tables. Safe to tap more than once. Enter your teacher passcode, then tap the button.</p>
          <label htmlFor="pc">TEACHER PASSCODE</label>
          <input id="pc" type="password" className="text-field" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && passcode && void run()} />
          {result && <div className={result.ok ? 'solved-banner' : 'field-error'} role="status">{result.text}</div>}
          <Button onClick={() => void run()} disabled={busy || !passcode}>{busy ? 'UPDATING…' : 'UPDATE DATABASE'} <span>→</span></Button>
        </section>
      </main>
    </div>
  )
}
