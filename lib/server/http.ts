import 'server-only'
import { NextResponse } from 'next/server'
import { GameError, type Creds } from './game'

export function credsFrom(req: Request): Creds {
  const h = req.headers
  return {
    teacherToken: h.get('x-teacher-token'),
    playerId: h.get('x-player-id'),
    playerToken: h.get('x-player-token'),
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Turns common deployment mistakes into an actionable message. Never includes keys or raw error text. */
export function setupHint(e: unknown): string {
  const m = e instanceof Error ? e.message : ''
  if (/Supabase is not configured/i.test(m))
    return 'Setup problem: the Supabase environment variables are missing in Vercel (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). Add them, then redeploy.'
  if (/Could not find the table|does not exist|schema cache|PGRST205|42P01/i.test(m))
    return 'Setup problem: the database tables are missing. Run supabase/migrations/0001_init.sql in the Supabase SQL Editor.'
  if (/Invalid API key|JWT|Unauthorized|401/i.test(m))
    return 'Setup problem: Supabase rejected the key. Check SUPABASE_SERVICE_ROLE_KEY (the service_role key, not the anon key).'
  if (/fetch failed|ENOTFOUND|ECONN|Invalid URL|getaddrinfo/i.test(m))
    return 'Setup problem: cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL (https://YOUR-REF.supabase.co).'
  return 'Something went wrong on the server.'
}

export function handleError(e: unknown) {
  if (e instanceof GameError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error(e)
  return NextResponse.json({ error: 'server_error', message: setupHint(e) }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
