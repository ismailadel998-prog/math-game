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

export function handleError(e: unknown) {
  if (e instanceof GameError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error(e)
  return NextResponse.json({ error: 'server_error', message: 'Something went wrong on the server.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
