'use client'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { CAR_NAMES, TOTAL_QUESTIONS, type PlayerView } from '@/lib/shared'
import { Car, carColor } from './ui'

export function Leaderboard({ players, meId, compact = false, title = 'LIVE RANKINGS', live = true }: {
  players: PlayerView[]; meId?: string; compact?: boolean; title?: string; live?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div className={compact ? 'leader compact' : 'leader'} aria-label="Leaderboard">
      <div className="section-title"><span>{title}</span>{live && <small>● LIVE</small>}</div>
      <LayoutGroup>
        {players.length === 0 && <div className="leader-name"><span>Waiting for racers…</span></div>}
        {players.map((r) => (
          <motion.div layout={!reduce} transition={{ duration: 0.35 }} key={r.id}
            className={`leader-row ${r.rank <= 3 ? `place-${r.rank}` : ''} ${r.id === meId ? 'me' : ''}`}>
            <b className="rank">{r.rank}</b>
            <Car color={carColor(r.car)} small label={`${CAR_NAMES[r.car]} car`} />
            <div className="leader-name">
              <b>{r.nickname}{r.id === meId ? ' (you)' : ''}</b>
              <span>{r.finished ? '🏁 Finished!' : `${r.progress} of ${TOTAL_QUESTIONS} checkpoints`}</span>
            </div>
            <div className="mini-progress" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_QUESTIONS} aria-valuenow={r.progress}>
              <i style={{ width: `${(r.progress / TOTAL_QUESTIONS) * 100}%`, transition: reduce ? 'none' : 'width .6s' }} />
            </div>
          </motion.div>
        ))}
      </LayoutGroup>
    </div>
  )
}
