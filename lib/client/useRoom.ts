'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StateResponse } from '../shared'
import { ApiError, fetchState, type Auth } from './api'

export type Connection = 'connecting' | 'online' | 'reconnecting'

/**
 * Keeps a room's state fresh:
 *  - Supabase Realtime broadcast ping ("something changed") → immediate refetch
 *  - polling as a safety net (and the only mechanism when Supabase is not configured)
 *  - refetch on tab focus / network recovery  → automatic reconnection
 *  - responses are applied in request order, so a slow stale response can never overwrite a newer one
 */
export function useRoom(code: string, auth: Auth, onUnauthorized: () => void) {
  const [state, setState] = useState<StateResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [receivedAt, setReceivedAt] = useState(0)
  const [realtimeOn, setRealtimeOn] = useState(false)
  const seq = useRef({ issued: 0, applied: 0 })
  const authRef = useRef(auth)
  const unauthorizedRef = useRef(onUnauthorized)
  authRef.current = auth
  unauthorizedRef.current = onUnauthorized
  const authKey = auth ? JSON.stringify(auth) : ''

  const refresh = useCallback(async () => {
    const mine = ++seq.current.issued
    try {
      const data = await fetchState(code, authRef.current)
      if (mine < seq.current.applied) return
      seq.current.applied = mine
      setState(data)
      setReceivedAt(performance.now())
      setError(null)
      setConnection('online')
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'network', 'offline')
      if (err.status === 401) { unauthorizedRef.current(); return }
      if (err.status === 404) { setError(err); return }
      setConnection('reconnecting')
    }
  }, [code])

  // initial + whenever credentials change
  useEffect(() => { void refresh() }, [refresh, authKey])

  // polling
  useEffect(() => {
    const ms = realtimeOn ? 4000 : 1500
    const id = window.setInterval(() => { if (!document.hidden) void refresh() }, ms)
    return () => window.clearInterval(id)
  }, [refresh, realtimeOn])

  // reconnect triggers
  useEffect(() => {
    const go = () => { if (!document.hidden) void refresh() }
    window.addEventListener('online', go)
    window.addEventListener('focus', go)
    document.addEventListener('visibilitychange', go)
    return () => {
      window.removeEventListener('online', go)
      window.removeEventListener('focus', go)
      document.removeEventListener('visibilitychange', go)
    }
  }, [refresh])

  // realtime ping
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) return
    let cleanup = () => {}
    let cancelled = false
    void import('@supabase/supabase-js').then(({ createClient }) => {
      if (cancelled) return
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
      const channel = client
        .channel(`room:${code}`)
        .on('broadcast', { event: 'changed' }, () => { void refresh() })
        .subscribe((status) => {
          setRealtimeOn(status === 'SUBSCRIBED')
          if (status === 'SUBSCRIBED') void refresh() // catch anything missed while (re)connecting
        })
      cleanup = () => { void client.removeChannel(channel) }
    })
    return () => { cancelled = true; cleanup(); setRealtimeOn(false) }
  }, [code, refresh])

  return { state, error, connection, receivedAt, refresh }
}

/** Live-ticking elapsed ms for the active question, based on the server's value (no clock-skew issues). */
export function useElapsed(state: StateResponse | null, receivedAt: number) {
  const [, setTick] = useState(0)
  const running = state?.room.status === 'running'
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTick((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [running])
  if (!state) return 0
  if (!running) return state.room.elapsedMs
  return state.room.elapsedMs + Math.max(0, performance.now() - receivedAt)
}

export function formatClock(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
