import 'server-only'
import { MemoryStore } from './memory-store'
import { SupabaseStore } from './supabase-store'
import type { Store } from './types'

const g = globalThis as unknown as { __raceStore?: Store }

export function getStore(): Store {
  if (g.__raceStore) return g.__raceStore
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    g.__raceStore = new SupabaseStore(url, key)
  } else if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_MEMORY_STORE === '1') {
    g.__raceStore = new MemoryStore()
  } else {
    throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  return g.__raceStore
}

/**
 * Tells connected browsers "something changed, refetch". Carries NO game data.
 * Uses Supabase Realtime's REST broadcast endpoint. A no-op in memory-store mode (clients poll).
 */
export async function notifyRoom(code: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `room:${code}`, event: 'changed', payload: {}, private: false }] }),
      signal: AbortSignal.timeout(2500),
    })
  } catch {
    // Non-fatal: clients also poll, so a missed ping only delays updates by a few seconds.
  }
}
