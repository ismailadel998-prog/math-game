'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiError, controlApi } from '@/lib/client/api'
import { clearTeacherSession, getTeacherSession } from '@/lib/client/session'
import { formatClock, useElapsed, useRoom } from '@/lib/client/useRoom'
import { PUBLIC_QUESTIONS, TOTAL_QUESTIONS, type ControlAction } from '@/lib/shared'
import { Leaderboard } from '@/components/Leaderboard'
import { Winner } from '@/components/Winner'
import { Button, ConfirmModal, Header, Logo, carColor } from '@/components/ui'

export default function TeacherClient({ code }: { code: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  useEffect(() => { setToken(getTeacherSession(code)?.teacherToken ?? null) }, [code])
  if (token === undefined) return <div className="page" />
  if (token === null) {
    return (
      <div className="page"><Header /><main className="teacher-main">
        <div className="notice">This browser does not have teacher access to room <b>{code}</b>. Open the dashboard on the device where you created the room, or create a new room.</div>
        <p><Link className="btn btn-primary btn-link" href="/teacher">Create a new room</Link></p>
      </main></div>
    )
  }
  return <Dashboard code={code} token={token} onLost={() => { clearTeacherSession(code); setToken(null) }} />
}

function Dashboard({ code, token, onLost }: { code: string; token: string; onLost: () => void }) {
  const auth = { teacherToken: token }
  const { state, error, connection, receivedAt, refresh } = useRoom(code, auth, onLost)
  const elapsed = useElapsed(state, receivedAt)
  const [msg, setMsg] = useState('')
  const [pending, setPending] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  async function act(a: ControlAction) {
    if (pending) return
    setPending(true); setMsg('')
    try { await controlApi(code, auth, a) }
    catch (e) { if (!(e instanceof ApiError && e.status === 409)) setMsg(e instanceof ApiError ? e.message : 'Action failed.') }
    finally { setPending(false); void refresh() }
  }

  if (error?.status === 404) return <div className="page"><Header /><main className="teacher-main"><div className="notice">Room not found. It may have been deleted. <Link href="/teacher">Create a new room</Link></div></main></div>
  if (!state) return <div className="page"><Header code={code} /><main className="teacher-main" aria-busy>Loading dashboard…</main></div>

  const room = state.room
  const players = state.players ?? []
  const answers = state.answers ?? []
  const joinUrl = `${origin}/play/${code}`
  const status = room.status
  const active = status === 'running' || status === 'paused'
  const q = PUBLIC_QUESTIONS[room.currentQ]
  const answered = answers.filter((a) => a.answer !== null).length
  const byId = new Map(players.map((p) => [p.id, p]))

  const resetModal = confirmReset && <ConfirmModal title="Reset the race?" body="Every student goes back to the start and the room returns to the lobby. All submitted answers will be cleared. This cannot be undone." confirmLabel="Reset race" onConfirm={() => { setConfirmReset(false); void act({ action: 'reset', confirm: true }) }} onCancel={() => setConfirmReset(false)} />
  const endModal = confirmEnd && <ConfirmModal title="End the race now?" body="The race stops and everyone sees the final results." confirmLabel="End race" onConfirm={() => { setConfirmEnd(false); void act({ action: 'end' }) }} onCancel={() => setConfirmEnd(false)} />

  if (status === 'finished') {
    return <>
      <Winner players={players} actions={<>
        <Button onClick={() => setConfirmReset(true)}>RESET &amp; RACE AGAIN ↻</Button>
        <Link className="btn btn-secondary btn-link" href="/teacher">New room</Link>
      </>} />
      {resetModal}
      {msg && <div className="conn-banner">{msg}</div>}
    </>
  }

  const statusLabel = { lobby: 'WAITING FOR STUDENTS', running: 'RACE IN PROGRESS', paused: 'RACE PAUSED', finished: '' }[status]

  return (
    <div className="page teacher-page">
      <header><Logo /><div className="teacher-label">TEACHER DASHBOARD</div><Link className="btn btn-ghost btn-link" href="/">Home</Link></header>
      <main className="teacher-main">
        <div className="share-box">
          <div><small>STUDENTS JOIN WITH ROOM CODE</small><div className="code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</div></div>
          <div style={{ flex: 1, minWidth: 180 }}><small>or open this link</small><small style={{ color: 'var(--blue2)' }}>{joinUrl}</small></div>
          <Button kind="secondary" onClick={() => { void navigator.clipboard?.writeText(joinUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }}>{copied ? 'COPIED ✓' : 'COPY LINK'}</Button>
        </div>

        <div className="teacher-head">
          <div><span>ROOM {code} • {room.playerCount} {room.playerCount === 1 ? 'STUDENT' : 'STUDENTS'}</span><div role="heading" aria-level={1}>Race Control Center</div></div>
          <div className={`status ${status === 'paused' ? 'paused' : ''}`} role="status">● {statusLabel}</div>
        </div>

        <div className="control-grid">
          <section className="control-panel">
            <div className="section-title"><span>RACE CONTROLS</span></div>
            <div className="big-controls">
              {status === 'paused'
                ? <Button onClick={() => void act({ action: 'resume' })} disabled={pending}>▶ RESUME RACE</Button>
                : <Button onClick={() => void act({ action: 'start' })} disabled={pending || status !== 'lobby'}>▶ START RACE</Button>}
              <Button kind="secondary" onClick={() => void act({ action: 'pause' })} disabled={pending || status !== 'running'}>Ⅱ PAUSE</Button>
              <Button kind="secondary" onClick={() => void act({ action: 'next', fromQ: room.currentQ })} disabled={pending || !active || room.currentQ >= TOTAL_QUESTIONS - 1}>
                {room.currentQ >= TOTAL_QUESTIONS - 1 && active ? 'LAST QUESTION' : 'NEXT QUESTION →'}
              </Button>
            </div>
            <div className="question-select">
              <label>QUESTION SELECTOR • LESSON 15–22</label>
              <div>{PUBLIC_QUESTIONS.map((x, i) => (
                <button key={x.number} className={i === room.currentQ ? 'active' : ''} disabled={!active || pending} onClick={() => void act({ action: 'goto', index: i })} aria-label={`Open question ${x.number}`} aria-pressed={i === room.currentQ}>{x.number}</button>
              ))}</div>
            </div>
            <div className="teacher-question">
              <span>{active ? `NOW SHOWING: QUESTION ${q.number}` : `UP FIRST: QUESTION ${q.number}`}</span>
              <b>{q.top} × {q.bottom}</b>
              <small>{active ? `Open for ${status === 'paused' ? 'PAUSED' : formatClock(elapsed)} • students must answer correctly to advance` : 'Press START to open this question to students'}</small>
            </div>
            <div className="toggles">
              <div><span>Show live leaderboard to students</span>
                <button className={room.showLeaderboard ? '' : 'off'} role="switch" aria-checked={room.showLeaderboard} onClick={() => void act({ action: 'toggle_leaderboard' })}>{room.showLeaderboard ? 'ON' : 'OFF'}</button></div>
            </div>
            {msg && <div className="field-error" role="alert">{msg}</div>}
          </section>

          <section className="answers-panel">
            <div className="section-title"><span>{active ? 'STUDENT ANSWERS' : 'STUDENTS'}</span><small>{active ? `${answered} OF ${answers.length} ANSWERED` : `${players.length} JOINED`}</small></div>
            {players.length === 0 && <div className="notice">No students yet. Share the room code above.</div>}
            {active
              ? answers.map((a) => {
                  const p = byId.get(a.playerId)
                  const cls = a.solved ? 'correct' : a.correct === false ? 'wrong' : 'wait'
                  return (
                    <div className="answer-row" key={a.playerId}>
                      <span className="student-dot" style={{ background: carColor(a.car) }}>{a.nickname[0]?.toUpperCase()}</span>
                      <b>{a.nickname}<span className={`conn-dot ${p?.connected ? 'on' : ''}`} title={p?.connected ? 'Online' : 'Disconnected'} role="img" aria-label={p?.connected ? 'online' : 'offline'} /></b>
                      <span>{a.answer ?? 'Thinking…'}{a.attempts > 1 ? ` (${a.attempts}×)` : ''}</span>
                      <i className={cls}>{a.solved ? '✓ CORRECT' : a.correct === false ? '× RETRY' : '•••'}</i>
                      <span className="prog">{p?.progress ?? 0}/{TOTAL_QUESTIONS}</span>
                    </div>
                  )
                })
              : players.map((p) => (
                  <div className="answer-row" key={p.id}>
                    <span className="student-dot" style={{ background: carColor(p.car) }}>{p.nickname[0]?.toUpperCase()}</span>
                    <b>{p.nickname}</b><span>{p.connected ? 'Online' : 'Offline'}</span><i className="correct">READY</i><span className="prog">{p.progress}/{TOTAL_QUESTIONS}</span>
                  </div>
                ))}
          </section>
        </div>

        {active && players.length > 0 && <div style={{ marginTop: 22 }}><Leaderboard players={players} title="LIVE STANDINGS" /></div>}

        <div className="danger-zone">
          <div><b>Game settings</b><span>End the race to show results, or reset to return everyone to the lobby.</span></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button kind="secondary" onClick={() => setConfirmEnd(true)} disabled={!active}>END RACE</Button>
            <Button kind="danger" onClick={() => setConfirmReset(true)}>RESET GAME</Button>
          </div>
        </div>
      </main>
      {connection === 'reconnecting' && <div className="conn-banner" role="status">Connection lost — reconnecting…</div>}
      {resetModal}{endModal}
    </div>
  )
}
