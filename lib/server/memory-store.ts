import { randomUUID } from 'node:crypto'
import type { PlayerRow, RoomGuard, RoomPatch, RoomRow, Store, SubmissionRow } from './types'

/** In-memory store for local development and tests. Single process only. */
export class MemoryStore implements Store {
  private rooms = new Map<string, RoomRow>()
  private players = new Map<string, PlayerRow>()
  private submissions = new Map<string, SubmissionRow[]>() // by roomId

  async createRoom(code: string, teacherTokenHash: string) {
    for (const r of this.rooms.values()) if (r.code === code) return null
    const room: RoomRow = {
      id: randomUUID(), code, teacherTokenHash, status: 'lobby', currentQ: 0,
      qOpenedAt: null, pausedAt: null, pausedTotalMs: 0, showLeaderboard: true, createdAt: Date.now(),
    }
    this.rooms.set(room.id, room)
    return { ...room }
  }

  async getRoomByCode(code: string) {
    for (const r of this.rooms.values()) if (r.code === code) return { ...r }
    return null
  }

  async updateRoom(id: string, patch: RoomPatch, guard?: RoomGuard) {
    const r = this.rooms.get(id)
    if (!r) return null
    if (guard?.status && !guard.status.includes(r.status)) return null
    if (guard?.currentQ !== undefined && guard.currentQ !== r.currentQ) return null
    Object.assign(r, patch)
    return { ...r }
  }

  async addPlayer(p: { roomId: string; nickname: string; car: number; tokenHash: string }) {
    for (const x of this.players.values()) {
      if (x.roomId === p.roomId && x.nickname.toLowerCase() === p.nickname.toLowerCase()) return 'duplicate_nickname' as const
    }
    const now = Date.now()
    const row: PlayerRow = {
      id: randomUUID(), roomId: p.roomId, nickname: p.nickname, car: p.car, tokenHash: p.tokenHash,
      progress: 0, solvedMask: 0, lastCorrectAt: null, finishedAt: null,
      joinedAt: now, lastSeenAt: now, lastSubmitAt: null,
    }
    this.players.set(row.id, row)
    return { ...row }
  }

  async getPlayer(roomId: string, playerId: string) {
    const p = this.players.get(playerId)
    return p && p.roomId === roomId ? { ...p } : null
  }

  async listPlayers(roomId: string) {
    return [...this.players.values()].filter((p) => p.roomId === roomId).map((p) => ({ ...p }))
  }

  async touchPlayer(playerId: string, now: number) {
    const p = this.players.get(playerId)
    if (p) p.lastSeenAt = now
  }

  async claimSubmitSlot(playerId: string, now: number, minGapMs: number) {
    const p = this.players.get(playerId)
    if (!p) return false
    if (p.lastSubmitAt !== null && now - p.lastSubmitAt < minGapMs) return false
    p.lastSubmitAt = now
    return true
  }

  async recordSubmission(roomId: string, s: SubmissionRow) {
    const list = this.submissions.get(roomId) ?? []
    list.push({ ...s })
    this.submissions.set(roomId, list)
  }

  async listSubmissions(roomId: string, questionIdx: number) {
    return (this.submissions.get(roomId) ?? []).filter((s) => s.questionIdx === questionIdx).map((s) => ({ ...s }))
  }

  async advancePlayer(roomId: string, playerId: string, q: number, now: number) {
    const room = this.rooms.get(roomId)
    const p = this.players.get(playerId)
    if (!room || !p || p.roomId !== roomId) return null
    if (room.status !== 'running' || room.currentQ !== q) return null
    if ((p.solvedMask & (1 << q)) !== 0) return null
    p.progress += 1
    p.solvedMask |= 1 << q
    p.lastCorrectAt = now
    if (p.progress >= 8) p.finishedAt = now
    return { ...p }
  }

  async resetRoom(roomId: string) {
    this.submissions.delete(roomId)
    for (const p of this.players.values()) {
      if (p.roomId !== roomId) continue
      p.progress = 0; p.solvedMask = 0; p.lastCorrectAt = null; p.finishedAt = null; p.lastSubmitAt = null
    }
    const r = this.rooms.get(roomId)
    if (r) Object.assign(r, { status: 'lobby', currentQ: 0, qOpenedAt: null, pausedAt: null, pausedTotalMs: 0 })
  }
}
