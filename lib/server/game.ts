import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import {
  MAX_NICKNAME, MAX_PLAYERS, PUBLIC_QUESTIONS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TOTAL_QUESTIONS,
  normalizeRoomCode,
  type AnswerRow, type ControlAction, type PlayerView, type StateResponse, type SubmitResult,
} from '../shared'
import { formatAnswer, isCorrect, parseAnswer } from './answers'
import type { PlayerRow, RoomRow, Store } from './types'

export class GameError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export interface Creds {
  teacherToken?: string | null
  playerId?: string | null
  playerToken?: string | null
}

export const MIN_SUBMIT_GAP_MS = 500
export const CONNECTED_WINDOW_MS = 20_000
const TOUCH_EVERY_MS = 10_000

// ── tokens ──────────────────────────────────────────────────────────
export const newToken = () => randomBytes(24).toString('base64url')
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')
function tokenMatches(token: string | null | undefined, hash: string): boolean {
  if (!token) return false
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── ranking ─────────────────────────────────────────────────────────
/**
 * Rank by checkpoints reached (desc), then by the SERVER timestamp at which the player
 * reached that checkpoint (asc; for finishers this is their completion time), then by
 * join order. Typing speed never matters; only accepted-answer timestamps do.
 */
export function rankPlayers(players: PlayerRow[]): PlayerRow[] {
  return [...players].sort((a, b) => {
    if (b.progress !== a.progress) return b.progress - a.progress
    const ta = a.lastCorrectAt ?? Infinity
    const tb = b.lastCorrectAt ?? Infinity
    if (ta !== tb) return ta - tb
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
    return a.id < b.id ? -1 : 1
  })
}

/** "869 × 46 = 39,974" — only ever returned after the teacher reveals it, or to a student who has used their one attempt. */
function working(qi: number): string {
  const q = PUBLIC_QUESTIONS[qi]
  return `${q.top} × ${q.bottom} = ${formatAnswer(qi)}`
}

export function elapsedMs(room: RoomRow, now: number): number {
  if (room.qOpenedAt === null) return 0
  const end = room.pausedAt ?? now
  return Math.max(0, end - room.qOpenedAt - room.pausedTotalMs)
}

// ── lookups & auth ──────────────────────────────────────────────────
async function requireRoom(store: Store, rawCode: string): Promise<RoomRow> {
  const room = await store.getRoomByCode(normalizeRoomCode(rawCode))
  if (!room) throw new GameError(404, 'room_not_found', 'Room not found. Check the code.')
  return room
}

function requireTeacher(room: RoomRow, creds: Creds) {
  if (!tokenMatches(creds.teacherToken, room.teacherTokenHash)) {
    throw new GameError(401, 'not_teacher', 'Teacher access required.')
  }
}

async function requirePlayer(store: Store, room: RoomRow, creds: Creds): Promise<PlayerRow> {
  if (!creds.playerId || !creds.playerToken) throw new GameError(401, 'not_member', 'Join the room first.')
  const p = await store.getPlayer(room.id, creds.playerId) // scoped to this room => membership enforced
  if (!p || !tokenMatches(creds.playerToken, p.tokenHash)) {
    throw new GameError(401, 'not_member', 'You are not a member of this room.')
  }
  return p
}

// ── room & players ──────────────────────────────────────────────────
export async function createRoom(store: Store, passcode: string | null | undefined) {
  const required = process.env.TEACHER_PASSCODE
  if (required) {
    const ok = !!passcode && hashToken(passcode) === hashToken(required)
    if (!ok) throw new GameError(401, 'bad_passcode', 'Wrong teacher passcode.')
  }
  const teacherToken = newToken()
  for (let i = 0; i < 20; i++) {
    let code = ''
    for (let k = 0; k < ROOM_CODE_LENGTH; k++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
    const room = await store.createRoom(code, hashToken(teacherToken))
    if (room) return { code: room.code, teacherToken }
  }
  throw new GameError(503, 'no_code', 'Could not allocate a room code. Try again.')
}

export function cleanNickname(raw: unknown): string {
  if (typeof raw !== 'string') throw new GameError(400, 'bad_nickname', 'Enter a nickname.')
  const n = raw.trim().replace(/\s+/g, ' ')
  if (n.length < 1 || n.length > MAX_NICKNAME) {
    throw new GameError(400, 'bad_nickname', `Nickname must be 1–${MAX_NICKNAME} characters.`)
  }
  if (!/^[\p{L}\p{N} _'.-]+$/u.test(n)) {
    throw new GameError(400, 'bad_nickname', 'Use letters, numbers, spaces, - _ . or \' only.')
  }
  return n
}

export async function joinRoom(store: Store, rawCode: string, nickname: unknown, car: unknown) {
  const room = await requireRoom(store, rawCode)
  if (room.status === 'finished') throw new GameError(409, 'race_finished', 'This race has already finished.')
  const nick = cleanNickname(nickname)
  if (!Number.isInteger(car) || (car as number) < 0 || (car as number) > 5) {
    throw new GameError(400, 'bad_car', 'Pick a car.')
  }
  if ((await store.listPlayers(room.id)).length >= MAX_PLAYERS) {
    throw new GameError(409, 'room_full', 'This room is full.')
  }
  const token = newToken()
  const player = await store.addPlayer({ roomId: room.id, nickname: nick, car: car as number, tokenHash: hashToken(token) })
  if (player === 'duplicate_nickname') {
    throw new GameError(409, 'nickname_taken', 'That nickname is already taken in this room. Try another.')
  }
  return { code: room.code, playerId: player.id, playerToken: token, nickname: player.nickname, car: player.car }
}

// ── state ───────────────────────────────────────────────────────────
export async function getState(store: Store, rawCode: string, creds: Creds, now: number): Promise<StateResponse> {
  const room = await requireRoom(store, rawCode)
  const isTeacher = !!creds.teacherToken
  if (isTeacher) requireTeacher(room, creds)
  let me: PlayerRow | null = null
  if (!isTeacher && (creds.playerId || creds.playerToken)) {
    me = await requirePlayer(store, room, creds)
    if (now - me.lastSeenAt > TOUCH_EVERY_MS) {
      await store.touchPlayer(me.id, now)
      me = { ...me, lastSeenAt: now }
    }
  }

  const players = await store.listPlayers(room.id)
  // Use fresh data for `me` after ranking so progress is always consistent with the board.
  const ranked = rankPlayers(players)
  const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]))
  const meFresh = me ? players.find((p) => p.id === me!.id) ?? me : null

  const showBoard = isTeacher || room.showLeaderboard || room.status === 'lobby' || room.status === 'finished'
  const board: PlayerView[] | null = showBoard
    ? ranked.map((p) => ({
        id: p.id, nickname: p.nickname, car: p.car, progress: p.progress, rank: rankOf.get(p.id)!,
        connected: now - p.lastSeenAt <= CONNECTED_WINDOW_MS, finished: p.progress >= TOTAL_QUESTIONS,
      }))
    : null

  let answers: AnswerRow[] | null = null
  if (isTeacher && (room.status === 'running' || room.status === 'paused')) {
    const subs = await store.listSubmissions(room.id, room.currentQ)
    answers = ranked.map((p) => {
      const mine = subs.filter((s) => s.playerId === p.id)
      const last = mine[mine.length - 1]
      return {
        playerId: p.id, nickname: p.nickname, car: p.car,
        answer: last ? last.answer : null,
        correct: last ? last.isCorrect : null,
        attempts: mine.length,
        solved: (p.solvedMask & (1 << room.currentQ)) !== 0,
        failed: (p.failedMask & (1 << room.currentQ)) !== 0,
      }
    })
  }

  const active = room.status === 'running' || room.status === 'paused'
  return {
    room: {
      code: room.code, status: room.status, currentQ: room.currentQ,
      question: active ? PUBLIC_QUESTIONS[room.currentQ] : null,
      showLeaderboard: room.showLeaderboard, elapsedMs: elapsedMs(room, now),
      revealedAnswer: active && room.revealed ? working(room.currentQ) : null,
      playerCount: players.length, serverNow: now,
    },
    me: meFresh
      ? {
          id: meFresh.id, nickname: meFresh.nickname, car: meFresh.car, progress: meFresh.progress,
          solvedCurrent: (meFresh.solvedMask & (1 << room.currentQ)) !== 0,
          failedCurrent: active && (meFresh.failedMask & (1 << room.currentQ)) !== 0,
          missedAnswer: active && (meFresh.failedMask & (1 << room.currentQ)) !== 0 ? working(room.currentQ) : null,
          rank: showBoard ? rankOf.get(meFresh.id) ?? null : null,
        }
      : null,
    players: board,
    answers,
    isTeacher,
  }
}

// ── answers ─────────────────────────────────────────────────────────
export async function submitAnswer(
  store: Store, rawCode: string, creds: Creds,
  body: { questionIndex: unknown; answer: unknown }, now: number,
): Promise<SubmitResult> {
  const room = await requireRoom(store, rawCode)
  const player = await requirePlayer(store, room, creds)

  if (typeof body.answer !== 'string' || !Number.isInteger(body.questionIndex)) {
    throw new GameError(400, 'bad_request', 'Invalid submission.')
  }
  const qi = body.questionIndex as number

  if (room.status === 'paused') return { result: 'paused' }
  if (room.status !== 'running') return { result: 'not_running' }
  if (qi !== room.currentQ) return { result: 'stale' }
  if (room.revealed) return { result: 'revealed' }
  if ((player.solvedMask & (1 << qi)) !== 0) return { result: 'already_solved', progress: player.progress }
  if ((player.failedMask & (1 << qi)) !== 0) return { result: 'already_failed', correctAnswer: working(qi) } // one attempt only

  const parsed = parseAnswer(body.answer)
  if (parsed === null) throw new GameError(400, 'invalid_answer', 'Enter a whole number, like 1234 or 1,234.') // not an attempt

  if (!(await store.claimSubmitSlot(player.id, now, MIN_SUBMIT_GAP_MS))) return { result: 'too_fast' }

  const text = body.answer.trim().slice(0, 20)
  // Whatever happens next, the first atomic outcome wins: either this student is locked out (wrong)
  // or advanced (right). A concurrent second submission can never produce the other outcome.
  const lostRace = async (): Promise<SubmitResult> => {
    const [r2, p2] = await Promise.all([store.getRoomByCode(room.code), store.getPlayer(room.id, player.id)])
    if (r2 && r2.status === 'paused') return { result: 'paused' }
    if (r2 && r2.revealed) return { result: 'revealed' }
    if (r2 && (r2.status !== 'running' || r2.currentQ !== qi)) return { result: 'stale' }
    if (p2 && (p2.failedMask & (1 << qi)) !== 0) return { result: 'already_failed', correctAnswer: working(qi) }
    return { result: 'already_solved', progress: p2?.progress ?? player.progress }
  }

  if (!isCorrect(qi, parsed)) {
    if (!(await store.failPlayer(room.id, player.id, qi))) return lostRace()
    await store.recordSubmission(room.id, { playerId: player.id, questionIdx: qi, answer: text, isCorrect: false, createdAt: now })
    return { result: 'incorrect', correctAnswer: working(qi) }
  }

  const advanced = await store.advancePlayer(room.id, player.id, qi, now)
  if (!advanced) return lostRace()
  await store.recordSubmission(room.id, { playerId: player.id, questionIdx: qi, answer: text, isCorrect: true, createdAt: now })

  const all = await store.listPlayers(room.id)
  if (all.length > 0 && all.every((p) => p.progress >= TOTAL_QUESTIONS)) {
    await store.updateRoom(room.id, { status: 'finished' }, { status: ['running'] })
  }
  const rank = rankPlayers(all).findIndex((p) => p.id === player.id) + 1
  return {
    result: 'correct', progress: advanced.progress,
    rank: room.showLeaderboard ? rank : null, finished: advanced.progress >= TOTAL_QUESTIONS,
  }
}

// ── teacher controls ────────────────────────────────────────────────
export async function control(store: Store, rawCode: string, creds: Creds, a: ControlAction, now: number) {
  const room = await requireRoom(store, rawCode)
  requireTeacher(room, creds)
  const stale = () => new GameError(409, 'stale', 'That control is out of date. The dashboard has been refreshed.')

  switch (a.action) {
    case 'start': {
      const r = await store.updateRoom(room.id, { status: 'running', currentQ: 0, qOpenedAt: now, pausedAt: null, pausedTotalMs: 0, ...(room.revealed ? { revealed: false } : {}) }, { status: ['lobby'] })
      if (!r) throw stale()
      return
    }
    case 'pause': {
      const r = await store.updateRoom(room.id, { status: 'paused', pausedAt: now }, { status: ['running'] })
      if (!r) throw stale()
      return
    }
    case 'resume': {
      const add = room.pausedAt !== null ? Math.max(0, now - room.pausedAt) : 0
      const r = await store.updateRoom(room.id, { status: 'running', pausedAt: null, pausedTotalMs: room.pausedTotalMs + add }, { status: ['paused'] })
      if (!r) throw stale()
      return
    }
    case 'next': {
      if (!Number.isInteger(a.fromQ)) throw new GameError(400, 'bad_request', 'fromQ required.')
      if (a.fromQ >= TOTAL_QUESTIONS - 1) throw new GameError(400, 'last_question', 'This is the last question. Use "End race".')
      const paused = room.status === 'paused'
      const r = await store.updateRoom(
        room.id,
        { currentQ: a.fromQ + 1, qOpenedAt: now, pausedTotalMs: 0, pausedAt: paused ? now : null, ...(room.revealed ? { revealed: false } : {}) },
        { status: ['running', 'paused'], currentQ: a.fromQ },
      )
      if (!r) throw stale()
      return
    }
    case 'goto': {
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= TOTAL_QUESTIONS) throw new GameError(400, 'bad_request', 'Bad question.')
      const paused = room.status === 'paused'
      const r = await store.updateRoom(
        room.id,
        { currentQ: a.index, qOpenedAt: now, pausedTotalMs: 0, pausedAt: paused ? now : null, ...(room.revealed ? { revealed: false } : {}) },
        { status: ['running', 'paused'] },
      )
      if (!r) throw stale()
      return
    }
    case 'reveal': {
      const r = await store.updateRoom(room.id, { revealed: true }, { status: ['running', 'paused'], currentQ: room.currentQ })
      if (!r) throw stale()
      return
    }
    case 'toggle_leaderboard': {
      await store.updateRoom(room.id, { showLeaderboard: !room.showLeaderboard })
      return
    }
    case 'reset': {
      if (a.confirm !== true) throw new GameError(400, 'confirm_required', 'Reset must be confirmed.')
      await store.resetRoom(room.id)
      return
    }
    case 'end': {
      const r = await store.updateRoom(room.id, { status: 'finished', pausedAt: null }, { status: ['running', 'paused'] })
      if (!r) throw stale()
      return
    }
    default:
      throw new GameError(400, 'bad_request', 'Unknown action.')
  }
}
