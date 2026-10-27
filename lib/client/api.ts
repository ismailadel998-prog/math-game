import type { ControlAction, StateResponse, SubmitResult } from '../shared'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export type Auth = { teacherToken: string } | { playerId: string; playerToken: string } | null

function headers(auth: Auth): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth && 'teacherToken' in auth) h['x-teacher-token'] = auth.teacherToken
  if (auth && 'playerId' in auth) { h['x-player-id'] = auth.playerId; h['x-player-token'] = auth.playerToken }
  return h
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { ...init, cache: 'no-store' })
  } catch {
    throw new ApiError(0, 'network', 'Connection problem. Check your internet and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong.')
  return data as T
}

export const fetchState = (code: string, auth: Auth, signal?: AbortSignal) =>
  call<StateResponse>(`/api/rooms/${code}/state`, { headers: headers(auth), signal })

export const createRoomApi = (passcode: string) =>
  call<{ code: string; teacherToken: string }>('/api/rooms', { method: 'POST', headers: headers(null), body: JSON.stringify({ passcode }) })

export const joinRoomApi = (code: string, nickname: string, car: number) =>
  call<{ code: string; playerId: string; playerToken: string; nickname: string; car: number }>(
    `/api/rooms/${code}/join`, { method: 'POST', headers: headers(null), body: JSON.stringify({ nickname, car }) })

export const submitApi = (code: string, auth: Auth, questionIndex: number, answer: string) =>
  call<SubmitResult>(`/api/rooms/${code}/submit`, { method: 'POST', headers: headers(auth), body: JSON.stringify({ questionIndex, answer }) })

export const controlApi = (code: string, auth: Auth, action: ControlAction) =>
  call<{ ok: true }>(`/api/rooms/${code}/control`, { method: 'POST', headers: headers(auth), body: JSON.stringify(action) })

export const configApi = () => call<{ passcodeRequired: boolean }>('/api/config', { method: 'GET' })
