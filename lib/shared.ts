// Client-safe constants and API types. Contains NO answers.

export interface PublicQuestion {
  number: number // 15–22, as printed in the textbook
  top: string
  bottom: string
}

export const PUBLIC_QUESTIONS: PublicQuestion[] = [
  { number: 15, top: '6,755', bottom: '9' },
  { number: 16, top: '869', bottom: '46' },
  { number: 17, top: '922', bottom: '81' },
  { number: 18, top: '783', bottom: '14' },
  { number: 19, top: '684', bottom: '15' },
  { number: 20, top: '650', bottom: '22' },
  { number: 21, top: '2,525', bottom: '37' },
  { number: 22, top: '615', bottom: '41' },
]

export const TOTAL_QUESTIONS = PUBLIC_QUESTIONS.length

export const CAR_COLORS = ['#ff4d5a', '#2f80ed', '#ffb21a', '#8b5cf6', '#20c785', '#ff6fb1']
export const CAR_NAMES = ['Blaze', 'Bolt', 'Flash', 'Rocket', 'Zoom', 'Spark']

export type RoomStatus = 'lobby' | 'running' | 'paused' | 'finished'

export interface PlayerView {
  id: string
  nickname: string
  car: number
  progress: number
  rank: number
  connected: boolean
  finished: boolean
}

export interface AnswerRow {
  playerId: string
  nickname: string
  car: number
  answer: string | null
  correct: boolean | null
  attempts: number
  solved: boolean
}

export interface RoomView {
  code: string
  status: RoomStatus
  currentQ: number
  question: PublicQuestion | null
  showLeaderboard: boolean
  elapsedMs: number
  playerCount: number
  serverNow: number
}

export interface MeView {
  id: string
  nickname: string
  car: number
  progress: number
  solvedCurrent: boolean
  rank: number | null
}

export interface StateResponse {
  room: RoomView
  me: MeView | null
  players: PlayerView[] | null // null when the teacher hid the leaderboard from students
  answers: AnswerRow[] | null // teacher only
  isTeacher: boolean
}

export type SubmitResult =
  | { result: 'correct'; progress: number; rank: number | null; finished: boolean }
  | { result: 'incorrect' }
  | { result: 'already_solved'; progress: number }
  | { result: 'paused' | 'not_running' | 'stale' | 'too_fast' }

export type ControlAction =
  | { action: 'start' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'next'; fromQ: number }
  | { action: 'goto'; index: number }
  | { action: 'toggle_leaderboard' }
  | { action: 'reset'; confirm: true }
  | { action: 'end' }

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 4
export const MAX_NICKNAME = 16
export const MAX_PLAYERS = 60

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/^RACE[-\s]*/, '').replace(/[^A-Z0-9]/g, '')
}
