'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

const COLORS = ['#ff4d5a', '#2f80ed', '#ffb21a', '#8b5cf6', '#20c785', '#ff6fb1', '#ffd43b']

/** Falling confetti. With reduced motion it renders a still scatter instead. */
export function Confetti({ count = 90, burst = false }: { count?: number; burst?: boolean }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => {
      // deterministic pseudo-random so server and client render identically
      const r = (n: number) => { const x = Math.sin(i * 9301 + n * 49297) * 233280; return x - Math.floor(x) }
      return { left: r(1) * 100, delay: r(2) * 2.5, dur: 2.8 + r(3) * 2.6, size: 7 + r(4) * 9, rot: r(5) * 720 - 360,
        drift: (r(6) - 0.5) * 160, color: COLORS[i % COLORS.length], round: r(7) > 0.6, top: r(8) * 80 }
    }),
    [count],
  )
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }}>
      {pieces.map((p, i) => reduce ? (
        <span key={i} style={{ position: 'absolute', left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size * 0.6, background: p.color, borderRadius: p.round ? '50%' : 2, opacity: 0.8, transform: `rotate(${p.rot}deg)` }} />
      ) : (
        <motion.span key={i}
          initial={{ y: burst ? 0 : '-10vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: burst ? '55vh' : '110vh', x: p.drift, rotate: p.rot, opacity: burst ? [1, 1, 0] : 1 }}
          transition={{ duration: p.dur, delay: p.delay * (burst ? 0.2 : 1), ease: 'easeIn', repeat: burst ? 0 : Infinity, repeatDelay: burst ? 0 : 0.2 }}
          style={{ position: 'absolute', left: `${burst ? 30 + p.left * 0.4 : p.left}%`, top: burst ? '35%' : 0, width: p.size, height: p.size * 0.6, background: p.color, borderRadius: p.round ? '50%' : 2 }} />
      ))}
    </div>
  )
}
