'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ApiError, fetchState, submitApi } from '@/lib/client/api'
import { clearPlayerSession, getPlayerSession, type PlayerSession } from '@/lib/client/session'
import { formatClock, useElapsed, useRoom } from '@/lib/client/useRoom'
import { sound } from '@/lib/client/sound'
import { useMood, useSoundSetup, useStateSounds } from '@/lib/client/useSound'
import { TOTAL_QUESTIONS } from '@/lib/shared'
import { Feedback } from '@/components/Feedback'
import { HeroCopy, JoinCard, WaitingFooter } from '@/components/JoinCard'
import { Leaderboard } from '@/components/Leaderboard'
import { Track } from '@/components/Track'
import { Winner } from '@/components/Winner'
import { Button, Car, ConfirmModal, Field, Header, carColor } from '@/components/ui'

export default function PlayClient({ code }: { code: string }) {
  const [session, setSession] = useState<PlayerSession | null | undefined>(undefined)
  useEffect(() => { setSession(getPlayerSession(code)) }, [code])
  if (session === undefined) return <div className="page" />
  if (session === null) return <JoinHere code={code} onJoined={() => setSession(getPlayerSession(code))} />
  return <Game code={code} session={session} onLost={() => { clearPlayerSession(code); setSession(null) }} />
}

function JoinHere({ code, onJoined }: { code: string; onJoined: () => void }) {
  useSoundSetup('student')
  useMood('lobby')
  const [car, setCar] = useState(0)
  const [exists, setExists] = useState<boolean | null>(null)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    fetchState(code, null)
      .then((s) => { setExists(true); setFinished(s.room.status === 'finished') })
      .catch((e) => setExists(e instanceof ApiError && e.status === 404 ? false : true))
  }, [code])
  return (
    <div className="page lobby-page">
      <Header code={code} right={<Link className="btn btn-ghost btn-link" href="/">Home</Link>} />
      <main className="lobby-main">
        <HeroCopy car={car} />
        {exists === false ? (
          <section className="join-card"><div className="card-title">Room not found</div><p>Check the room code with your teacher.</p><Link className="btn btn-primary btn-link" href="/">Back to start</Link></section>
        ) : finished ? (
          <section className="join-card"><div className="card-title">This race has finished</div><p>Ask your teacher for a new room code.</p><Link className="btn btn-primary btn-link" href="/">Back to start</Link></section>
        ) : (
          <JoinCard fixedCode={code} car={car} setCar={setCar} onJoined={onJoined} />
        )}
      </main>
    </div>
  )
}

interface FeedbackState { correct: boolean; progress: number; rank: number | null; finished: boolean; correctAnswer?: string | null }

function Game({ code, session, onLost }: { code: string; session: PlayerSession; onLost: () => void }) {
  const router = useRouter()
  const auth = { playerId: session.playerId, playerToken: session.playerToken }
  const { state, error, connection, receivedAt, refresh } = useRoom(code, auth, onLost)
  const elapsed = useElapsed(state, receivedAt)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [view, setView] = useState<'race' | 'board'>('race')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const currentQ = state?.room.currentQ
  useSoundSetup('student')
  useStateSounds(state, 'student')
  const st = state?.room.status
  useMood(st === 'running' ? 'race' : st === 'paused' || st === 'lobby' ? 'lobby' : 'off')

  useEffect(() => { setAnswer(''); setNotice('') }, [currentQ])

  if (error?.status === 404) return <div className="page"><Header /><main className="teacher-main"><div className="notice">Room not found. <Link href="/">Back to start</Link></div></main></div>
  if (!state || !state.me) return <div className="page"><Header code={code} /><main className="teacher-main" aria-busy>Connecting to the race…</main></div>

  const { room, me, players } = state
  const reconnecting = connection === 'reconnecting' && <div className="conn-banner" role="status">Connection lost — reconnecting…</div>
  const leave = () => { clearPlayerSession(code); router.push('/') }
  const leaveBtn = <Button kind="ghost" onClick={() => setConfirmLeave(true)}>Leave race</Button>
  const modal = confirmLeave && <ConfirmModal title="Leave the race?" body="Your car and progress will be removed from this device. You can join again with a new nickname." confirmLabel="Leave" onConfirm={leave} onCancel={() => setConfirmLeave(false)} />

  async function submit() {
    if (busy || !answer.trim() || room.status !== 'running') return
    setBusy(true); setNotice('')
    try {
      const r = await submitApi(code, auth, room.currentQ, answer)
      switch (r.result) {
        case 'correct': sound.play('correct'); setFeedback({ correct: true, progress: r.progress, rank: r.rank, finished: r.finished }); break
        case 'incorrect': sound.play('wrong'); setFeedback({ correct: false, progress: me!.progress, rank: me!.rank, finished: false, correctAnswer: r.correctAnswer }); break
        case 'already_failed': setNotice('You already used your one try on this question.'); break
        case 'already_solved': setNotice('You already solved this question.'); break
        case 'paused': setNotice('The teacher paused the race. Hang tight!'); break
        case 'revealed': setNotice('The teacher revealed the answer, so this question is closed.'); break
        case 'stale': setNotice('The teacher moved to a new question.'); break
        case 'too_fast': setNotice('Easy there! Wait a moment, then try again.'); break
        case 'not_running': setNotice('The race is not running right now.'); break
      }
      void refresh()
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Could not send your answer. Try again.')
    } finally { setBusy(false) }
  }

  if (feedback) {
    return <>{reconnecting}<Feedback correct={feedback.correct} nickname={me.nickname} car={me.car} progress={feedback.correct ? feedback.progress : me.progress}
      rank={feedback.correct ? feedback.rank : me.rank} finished={feedback.finished} correctAnswer={feedback.correctAnswer}
      onContinue={() => { setFeedback(null); setAnswer('') }} /></>
  }

  if (room.status === 'finished') {
    return <>{reconnecting}<Winner players={players ?? []} meId={me.id} actions={<Button onClick={leave}>BACK TO START</Button>} /></>
  }

  if (room.status === 'lobby') {
    return (
      <div className="page lobby-page">
        <Header code={code} right={leaveBtn} />
        <main className="lobby-main">
          <HeroCopy car={me.car} eyebrow="YOU'RE IN! WAITING FOR THE TEACHER" />
          <section className="join-card" aria-live="polite">
            <div className="card-kicker">RACE ENTRY CONFIRMED</div>
            <div className="card-title" role="heading" aria-level={2}>Get ready, {me.nickname}!</div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}><div style={{ transform: 'scale(1.6)' }}><Car color={carColor(me.car)} /></div></div>
            <p style={{ color: 'var(--muted)', textAlign: 'center' }}>Have your paper and pencil ready. The race starts when your teacher presses start.</p>
            <WaitingFooter players={players ?? []} />
          </section>
        </main>
        {reconnecting}{modal}
      </div>
    )
  }

  const q = room.question!
  const paused = room.status === 'paused'
  const canAnswer = room.status === 'running' && !me.solvedCurrent && !me.failedCurrent && !room.revealedAnswer

  if (view === 'board' && players) {
    return (
      <div className="page leaderboard-page"><Header code={code} right={leaveBtn} />
        <main><Button kind="ghost" onClick={() => setView('race')}>← Back to race</Button>
          <div className="leaderboard-title">LIVE LEADERBOARD<small>Positions update after every correct answer</small></div>
          <Leaderboard players={players} meId={me.id} />
        </main>{reconnecting}{modal}
      </div>
    )
  }

  return (
    <div className="page">
      <Header code={code} right={leaveBtn} />
      <div className="race-heading">
        <div><span>THE CHAMPIONSHIP</span><b>GO, {me.nickname.toUpperCase()}!</b></div>
        {players && <Button kind="secondary" onClick={() => setView('board')}>View full leaderboard</Button>}
      </div>
      <Track progress={me.progress} nickname={me.nickname} car={me.car} others={players ?? []} meId={me.id} />
      <main className="game-grid">
        <div className="challenge-card">
          <div className="challenge-top">
            <div><span>QUESTION {q.number}</span><b>{room.currentQ + 1} <small>OF {TOTAL_QUESTIONS}</small></b></div>
            <div className="timer"><span>TIME</span><b>{paused ? 'PAUSED' : formatClock(elapsed)}</b></div>
          </div>
          <div className="instruction"><span aria-hidden>✎</span> Solve on paper first, then enter your answer.</div>
          <div className="problem" role="img" aria-label={`${q.top} times ${q.bottom}`}><span>{q.top}</span><span>×&nbsp; {q.bottom}</span><i /></div>
          {paused && <div className="paused-banner" role="status">⏸ The teacher paused the race</div>}
          {me.failedCurrent && me.missedAnswer ? (
            <div className="missed-banner" role="status">✎ NOT THIS TIME. THE CORRECT ANSWER IS<b>{me.missedAnswer}</b><small>Write it in your math book, then wait for the next question.</small></div>
          ) : room.revealedAnswer ? (
            <div className="reveal-banner" role="status">THE CORRECT ANSWER<b>{room.revealedAnswer}</b><small>{me.solvedCurrent ? 'You got this one!' : 'This question is closed. Check your working on paper.'}</small></div>
          ) : me.solvedCurrent ? (
            <div className="solved-banner" role="status">✓ Solved! Nice work.<small>Waiting for the teacher to open the next question…</small></div>
          ) : (
            <>
              <label htmlFor="ans">YOUR ANSWER</label>
              <Field answer value={answer} onChange={setAnswer} placeholder="Type your answer" disabled={!canAnswer} onEnter={() => void submit()} label="Your answer" />
              {notice && <div className="notice" role="alert">{notice}</div>}
              <Button onClick={() => void submit()} disabled={!answer.trim() || !canAnswer || busy}>{busy ? 'CHECKING…' : 'SUBMIT ANSWER'} <span>→</span></Button>
            </>
          )}
          <div className="speed"><div><span>SPEED</span><b>{me.progress < 3 ? 'WARMING UP' : 'FULL THROTTLE'}</b></div>
            <div className="speed-bars">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= Math.max(1, me.progress) ? 'on' : ''} />)}</div></div>
          {me.rank !== null && <div className="instruction" style={{ marginTop: 14 }}>Your position: <b>{me.rank}</b> of {room.playerCount}</div>}
        </div>
        {players && <Leaderboard players={players} meId={me.id} compact />}
      </main>
      {reconnecting}{modal}
    </div>
  )
}

