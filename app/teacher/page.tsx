'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, configApi, createRoomApi } from '@/lib/client/api'
import { getLast, saveTeacherSession } from '@/lib/client/session'
import { Button, Field, Header } from '@/components/ui'

export default function TeacherStart() {
  const router = useRouter()
  const [passcodeRequired, setPasscodeRequired] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState<string | null>(null)
  useEffect(() => {
    configApi().then((c) => setPasscodeRequired(c.passcodeRequired)).catch(() => {})
    const l = getLast(); if (l?.role === 'teacher') setLast(l.code)
  }, [])

  async function create() {
    setBusy(true); setError('')
    try {
      const r = await createRoomApi(passcode)
      saveTeacherSession(r.code, { teacherToken: r.teacherToken })
      router.push(`/teacher/${r.code}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the room.')
      setBusy(false)
    }
  }

  return (
    <div className="page lobby-page">
      <Header right={<Link className="btn btn-ghost btn-link" href="/">Student join</Link>} />
      <main className="lobby-main">
        <section className="hero-copy">
          <div className="eyebrow">TEACHER DASHBOARD</div>
          <div className="hero-title" role="heading" aria-level={1}>RACE<br /><em>CONTROL</em></div>
          <div className="subtitle">Create a room. Share the code. Start the race.</div>
          <p>You control when the race starts, which question is open, and when to pause. Students solve on paper and type their answers.</p>
        </section>
        <section className="join-card">
          <div className="card-kicker">NEW RACE</div>
          <div className="card-title" role="heading" aria-level={2}>Create a race room</div>
          {passcodeRequired && (<>
            <label htmlFor="pc">TEACHER PASSCODE</label>
            <input id="pc" type="password" className="text-field" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && void create()} />
          </>)}
          {error && <div className="field-error" role="alert">{error}</div>}
          <Button onClick={() => void create()} disabled={busy || (passcodeRequired && !passcode)}>{busy ? 'CREATING…' : 'CREATE ROOM'} <span>→</span></Button>
          {last && <div className="rejoin"><span>Resume your room <b>{last}</b></span><Link className="btn btn-secondary btn-link" href={`/teacher/${last}`}>Resume</Link></div>}
        </section>
      </main>
    </div>
  )
}
