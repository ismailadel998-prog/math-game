'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { PUBLIC_QUESTIONS, TOTAL_QUESTIONS, type PlayerView } from '@/lib/shared'
import { Car, carColor } from './ui'

const pct = (progress: number) => Math.min((progress / TOTAL_QUESTIONS) * 88 + 2, 89)

export function Track({ progress, nickname, car, others = [], meId }: {
  progress: number; nickname: string; car: number; others?: PlayerView[]; meId?: string
}) {
  const reduce = useReducedMotion()
  const move = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 55, damping: 13, mass: 1 }
  const rivals = others.filter((p) => p.id !== meId)
  return (
    <div className="track-wrap">
      <div className="sky-decor"><span className="cloud c1" /><span className="cloud c2" /><span className="sun" /></div>
      <div className="track-labels" aria-label="Checkpoints">
        {PUBLIC_QUESTIONS.map((q, i) => (
          <span key={q.number} className={i < progress ? 'done' : i === progress ? 'active' : ''} title={`Checkpoint ${i + 1}`}>{i < progress ? '✓' : i + 1}</span>
        ))}
      </div>
      <div className="race-track">
        <div className="lane-dashes" />
        {rivals.map((p, i) => (
          <motion.div key={p.id} className="other-car" style={{ top: [4, 64, 34][i % 3] }} initial={false}
            animate={{ left: `${pct(p.progress)}%` }} transition={move} title={`${p.nickname}: ${p.progress} of ${TOTAL_QUESTIONS}`}>
            <Car color={carColor(p.car)} small={false} label={`${p.nickname}'s car`} />
          </motion.div>
        ))}
        <motion.div className="player-car" initial={false} animate={{ left: `${pct(progress)}%` }} transition={move}>
          <div className="name-tag">{nickname}</div><Car color={carColor(car)} label="your car" />
        </motion.div>
        <div className="finish" aria-hidden><i /><i /><i /><i /><i /><i /></div>
      </div>
      <div className="grass"><span>🏁 FINISH</span></div>
    </div>
  )
}
