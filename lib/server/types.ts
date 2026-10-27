import type { RoomStatus } from '../shared'

// All timestamps are epoch milliseconds in this layer.
export interface RoomRow {
  id: string
  code: string
  teacherTokenHash: string
  status: RoomStatus
  currentQ: number
  qOpenedAt: number | null
  pausedAt: number | null
  pausedTotalMs: number
  showLeaderboard: boolean
  createdAt: number
}

export interface PlayerRow {
  id: string
  roomId: string
  nickname: string
  car: number
  tokenHash: string
  progress: number
  solvedMask: number
  lastCorrectAt: number | null
  finishedAt: number | null
  joinedAt: number
  lastSeenAt: number
  lastSubmitAt: number | null
}

export interface SubmissionRow {
  playerId: string
  questionIdx: number
  answer: string
  isCorrect: boolean
  createdAt: number
}

export type RoomPatch = Partial<
  Pick<RoomRow, 'status' | 'currentQ' | 'qOpenedAt' | 'pausedAt' | 'pausedTotalMs' | 'showLeaderboard'>
>

export interface RoomGuard {
  status?: RoomStatus[]
  currentQ?: number
}

/** Persistence contract. Every method that must be atomic is atomic in both implementations. */
export interface Store {
  createRoom(code: string, teacherTokenHash: string): Promise<RoomRow | null> // null = code taken
  getRoomByCode(code: string): Promise<RoomRow | null>
  /** Compare-and-set update. Returns null when the guard does not match. */
  updateRoom(id: string, patch: RoomPatch, guard?: RoomGuard): Promise<RoomRow | null>
  addPlayer(p: { roomId: string; nickname: string; car: number; tokenHash: string }): Promise<PlayerRow | 'duplicate_nickname'>
  getPlayer(roomId: string, playerId: string): Promise<PlayerRow | null>
  listPlayers(roomId: string): Promise<PlayerRow[]>
  touchPlayer(playerId: string, now: number): Promise<void>
  /** Atomically claims the submit slot; false if the player submitted less than minGapMs ago. */
  claimSubmitSlot(playerId: string, now: number, minGapMs: number): Promise<boolean>
  recordSubmission(roomId: string, s: SubmissionRow): Promise<void>
  listSubmissions(roomId: string, questionIdx: number): Promise<SubmissionRow[]>
  /** Atomic: +1 checkpoint iff room running, active question matches, and not yet solved. */
  advancePlayer(roomId: string, playerId: string, questionIdx: number, now: number): Promise<PlayerRow | null>
  resetRoom(roomId: string): Promise<void>
}
