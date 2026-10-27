'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { TOTAL_QUESTIONS } from '@/lib/shared'
import { ordinal } from '@/lib/client/format'
import { Confetti } from './Confetti'
import { Button, Car, carColor } from './ui'

export function Feedback({ correct, nickname, car, progress, rank, finished, onContinue, onRetry }: {
  correct: boolean; nickname: string; car: number; progress: number; rank: number | null
  finished: boolean; onContinue: () => void; onRetry: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <div className={`feedback-page ${correct ? 'success' : 'retry'}`} role="alertdialog" aria-live="assertive" aria-label={correct ? 'Correct answer' : 'Not quite'}>
      {correct && <Confetti count={36} burst />}
      <motion.div className="feedback-card" initial={reduce ? false : { scale: 0.9, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <motion.div className="feedback-badge" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.1 }}>{correct ? '✓' : '↻'}</motion.div>
        <div className="feedback-title" role="heading" aria-level={1}>{correct ? 'CORRECT!' : 'NOT QUITE!'}</div>
        <div className="feedback-sub">{correct ? (finished ? 'YOU CROSSED THE FINISH LINE!' : 'FULL SPEED AHEAD!') : 'TRY AGAIN!'}</div>
        <p>{correct ? `Great multiplication, ${nickname}! Your car zoomed to the next checkpoint.` : 'Good try! Check your work on paper and give it another shot.'}</p>
        <div className="feedback-road">
          <div className="trail">━━ ━ ━</div>
          <motion.div initial={reduce || !correct ? false : { x: -50 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}><Car color={carColor(car)} /></motion.div>
          <span>Checkpoint {progress} of {TOTAL_QUESTIONS}</span>
        </div>
        {rank !== null && (
          <div className="position-card"><span>YOUR RACE POSITION</span><b>{ordinal(rank)}</b><small>{correct ? 'Keep it up!' : 'Your car stays here'}</small></div>
        )}
        <Button onClick={correct ? onContinue : onRetry}>{correct ? (finished ? 'SEE RESULTS' : 'CONTINUE RACING') : 'TRY THIS QUESTION AGAIN'} <span>→</span></Button>
        {!correct && <div className="encourage">No answer revealed — you’ve got this!</div>}
      </motion.div>
    </div>
  )
}
