'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { TOTAL_QUESTIONS } from '@/lib/shared'
import { ordinal } from '@/lib/client/format'
import { Confetti } from './Confetti'
import { Button, Car, carColor } from './ui'

export function Feedback({ correct, nickname, car, progress, rank, finished, correctAnswer, onContinue }: {
  correct: boolean; nickname: string; car: number; progress: number; rank: number | null
  finished: boolean; correctAnswer?: string | null; onContinue: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <div className={`feedback-page ${correct ? 'success' : 'retry'}`} role="alertdialog" aria-live="assertive" aria-label={correct ? 'Correct answer' : 'Not quite'}>
      {correct && <Confetti count={36} burst />}
      <motion.div className="feedback-card" initial={reduce ? false : { scale: 0.9, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <motion.div className="feedback-badge" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.1 }}>{correct ? '✓' : '✎'}</motion.div>
        <div className="feedback-title" role="heading" aria-level={1}>{correct ? 'CORRECT!' : 'NOT QUITE!'}</div>
        <div className="feedback-sub">{correct ? (finished ? 'YOU CROSSED THE FINISH LINE!' : 'FULL SPEED AHEAD!') : 'THE CORRECT ANSWER IS'}</div>
        {!correct && correctAnswer && <div className="reveal-banner" style={{ margin: '14px 0' }}><b>{correctAnswer}</b></div>}
        <p>{correct ? `Great multiplication, ${nickname}! Your car zoomed to the next checkpoint.` : '✏️ Please write the correct answer in your math book. Then get ready for the next question!'}</p>
        <div className="feedback-road">
          <div className="trail">━━ ━ ━</div>
          <motion.div initial={reduce || !correct ? false : { x: -50 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}><Car color={carColor(car)} /></motion.div>
          <span>Checkpoint {progress} of {TOTAL_QUESTIONS}</span>
        </div>
        {rank !== null && (
          <div className="position-card"><span>YOUR RACE POSITION</span><b>{ordinal(rank)}</b><small>{correct ? 'Keep it up!' : 'Your car stays here'}</small></div>
        )}
        <Button onClick={onContinue}>{correct ? (finished ? 'SEE RESULTS' : 'CONTINUE RACING') : 'I WROTE IT IN MY BOOK'} <span>→</span></Button>
        {!correct && <div className="encourage">One try per question. You&apos;ve got the next one!</div>}
      </motion.div>
    </div>
  )
}
