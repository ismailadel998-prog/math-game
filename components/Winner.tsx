'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'
import { sound } from '@/lib/client/sound'
import { CAR_NAMES, TOTAL_QUESTIONS, type PlayerView } from '@/lib/shared'
import { Confetti } from './Confetti'
import { Car, Logo, carColor } from './ui'
import { ordinal } from '@/lib/client/format'

export function Winner({ players, meId, actions }: { players: PlayerView[]; meId?: string; actions: React.ReactNode }) {
  const reduce = useReducedMotion()
  useEffect(() => { sound.play('win') }, [])
  const [first, second, third] = players
  const me = players.find((p) => p.id === meId)
  const pod = (p: PlayerView | undefined, place: 1 | 2 | 3) => {
    if (!p) return <div className="pod side" style={{ visibility: 'hidden' }} key={place} />
    const delay = place === 1 ? 0.5 : place === 2 ? 0.25 : 0
    return (
      <motion.div key={place} className={`pod ${place === 1 ? 'first' : 'side'}`}
        initial={reduce ? false : { y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay }}>
        {place === 1 && <div className="crown" aria-hidden>♛</div>}
        {place === 1 ? <><Car color={carColor(p.car)} label={`${CAR_NAMES[p.car]} car`} /><b>1</b></> : <><b>{place}</b><Car color={carColor(p.car)} small label={`${CAR_NAMES[p.car]} car`} /></>}
        <span>{p.nickname}</span>
      </motion.div>
    )
  }
  return (
    <div className="winner">
      <Confetti />
      <Logo />
      <div className="winner-kicker">{first ? `${first.nickname.toUpperCase()} TAKES THE CHECKERED FLAG` : 'THE RACE IS OVER'}</div>
      <div className="winner-title" role="heading" aria-level={1}>MULTIPLICATION<br /><em>CHAMPION!</em></div>
      <div className="podium">{pod(second, 2)}{pod(first, 1)}{pod(third, 3)}</div>
      <p>{me ? `You finished ${ordinal(me.rank)} with ${me.progress} of ${TOTAL_QUESTIONS} questions solved.` : `${TOTAL_QUESTIONS} questions • A championship performance!`}</p>
      <div className="final-list">
        <h3>FINAL RANKINGS</h3>
        {players.map((p) => (
          <div key={p.id} className={`leader-row ${p.rank <= 3 ? `place-${p.rank}` : ''} ${p.id === meId ? 'me' : ''}`}>
            <b className="rank">{p.rank}</b><Car color={carColor(p.car)} small label="car" />
            <div className="leader-name"><b>{p.nickname}{p.id === meId ? ' (you)' : ''}</b><span>{p.progress} of {TOTAL_QUESTIONS} solved{p.finished ? ' · finished' : ''}</span></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>{actions}</div>
    </div>
  )
}
