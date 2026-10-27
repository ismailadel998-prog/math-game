'use client'
import { useState } from 'react'
import { CAR_COLORS, CAR_NAMES, MAX_NICKNAME, ROOM_CODE_LENGTH, normalizeRoomCode, type PlayerView } from '@/lib/shared'
import { ApiError, joinRoomApi } from '@/lib/client/api'
import { savePlayerSession } from '@/lib/client/session'
import { Button, Car, Field } from './ui'

export function HeroCopy({ car, eyebrow = 'GRADE 5 • LIVE CLASS RACE', children }: { car: number; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <section className="hero-copy">
      <div className="eyebrow">{eyebrow}</div>
      <div className="hero-title" role="heading" aria-level={1}>MULTIPLICATION<br /><em>RACE</em></div>
      <div className="subtitle">Solve. Race. Win!</div>
      <p>Master 8 multiplication challenges and speed past the competition. Ready to start your engine?</p>
      <div className="hero-car"><div className="speed-lines" aria-hidden>—<br />——<br />—</div><Car color={CAR_COLORS[car]} /></div>
      {children}
    </section>
  )
}

export function WaitingFooter({ players }: { players: PlayerView[] }) {
  const n = players.length
  return (
    <div className="waiting">
      <div className="avatars">{players.slice(0, 3).map((r) => <span key={r.id} style={{ background: CAR_COLORS[r.car] }}>{r.nickname[0]?.toUpperCase()}</span>)}</div>
      <div><b>{n} {n === 1 ? 'racer is' : 'racers are'} ready!</b><span>Waiting for the teacher to start</span></div>
      <i className="pulse" />
    </div>
  )
}

export function JoinCard({ fixedCode, car, setCar, onJoined }: {
  fixedCode?: string; car: number; setCar: (n: number) => void; onJoined: (code: string) => void
}) {
  const [code, setCode] = useState(fixedCode ?? '')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cleanCode = normalizeRoomCode(fixedCode ?? code)
  const ready = cleanCode.length === ROOM_CODE_LENGTH && nickname.trim().length > 0

  async function join() {
    if (!ready || busy) return
    setBusy(true); setError('')
    try {
      const r = await joinRoomApi(cleanCode, nickname, car)
      savePlayerSession(r.code, { playerId: r.playerId, playerToken: r.playerToken, nickname: r.nickname, car: r.car })
      onJoined(r.code)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join. Try again.')
      setBusy(false)
    }
  }

  return (
    <section className="join-card">
      <div className="card-kicker">RACE ENTRY</div>
      <div className="card-title" role="heading" aria-level={2}>Choose your racer</div>
      {!fixedCode && (<>
        <label htmlFor="room-code">ROOM CODE</label>
        <input id="room-code" className="text-field code-field" value={code} maxLength={ROOM_CODE_LENGTH + 5}
          onChange={(e) => setCode(e.target.value)} placeholder="ABCD" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onKeyDown={(e) => e.key === 'Enter' && void join()} />
      </>)}
      <label htmlFor="nick">YOUR RACING NICKNAME</label>
      <Field value={nickname} onChange={setNickname} placeholder="Enter a fun nickname" maxLength={MAX_NICKNAME} onEnter={() => void join()} label="Your racing nickname" />
      <label>PICK YOUR CAR</label>
      <div className="car-picker" role="radiogroup" aria-label="Pick your car">
        {CAR_COLORS.map((c, i) => (
          <button key={c} role="radio" aria-checked={car === i} aria-label={`${CAR_NAMES[i]} car`} className={car === i ? 'selected' : ''} onClick={() => setCar(i)}>
            <Car color={c} small /><span>{CAR_NAMES[i]}</span>
          </button>
        ))}
      </div>
      {error && <div className="field-error" role="alert">{error}</div>}
      <Button onClick={() => void join()} disabled={!ready || busy}>{busy ? 'JOINING…' : 'JOIN THE RACE'} <span>→</span></Button>
    </section>
  )
}
