'use client'
import { MotionConfig } from 'framer-motion'

/** `reducedMotion="user"` makes Framer Motion honor the OS "reduce motion" setting. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
