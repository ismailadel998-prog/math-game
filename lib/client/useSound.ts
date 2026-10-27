'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { StateResponse } from '../shared'
import { sound, type Mood } from './sound'

/** Initialise the engine once; `role` decides the default for music (teacher: off, so it doesn't clash on screen-share). */
export function useSoundSetup(role: 'student' | 'teacher') {
  useEffect(() => { sound.musicDefault = role === 'student'; sound.init() }, [role])
}

export function useMood(mood: Mood) {
  useEffect(() => { sound.setMood(mood); return () => sound.setMood('off') }, [mood])
}

export function useSoundPrefs() {
  const sub = (cb: () => void) => sound.subscribe(cb)
  const music = useSyncExternalStore(sub, () => sound.musicOn, () => true)
  const sfx = useSyncExternalStore(sub, () => sound.sfxOn, () => true)
  return { music, sfx }
}

/** Plays effects when the shared race state changes (never on the first load, so reconnects stay quiet). */
export function useStateSounds(state: StateResponse | null, role: 'student' | 'teacher') {
  const prev = useRef<StateResponse | null>(null)
  useEffect(() => {
    if (!state) return
    const p = prev.current
    prev.current = state
    if (!p) return
    const a = p.room, b = state.room
    if (a.status === 'lobby' && b.status === 'running') sound.play('start')
    else if (a.status !== 'paused' && b.status === 'paused') sound.play('pause')
    else if (a.status === 'paused' && b.status === 'running') sound.play('resume')
    else if (b.status === 'running' && a.status === 'running' && a.currentQ !== b.currentQ) sound.play('question')
    if (!a.revealedAnswer && b.revealedAnswer) sound.play('reveal')
    if (role === 'teacher' && b.playerCount > a.playerCount) sound.play('join')
  }, [state, role])
}
