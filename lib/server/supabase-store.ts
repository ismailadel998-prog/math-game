import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PlayerRow, RoomGuard, RoomPatch, RoomRow, Store, SubmissionRow } from './types'

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())
const ms = (s: string | null) => (s === null ? null : new Date(s).getTime())

/* eslint-disable @typescript-eslint/no-explicit-any */
const toRoom = (r: any): RoomRow => ({
  id: r.id, code: r.code, teacherTokenHash: r.teacher_token_hash, status: r.status, currentQ: r.current_q,
  qOpenedAt: ms(r.q_opened_at), pausedAt: ms(r.paused_at), pausedTotalMs: Number(r.paused_total_ms),
  showLeaderboard: r.show_leaderboard, revealed: r.revealed === true, createdAt: ms(r.created_at)!,
})
const toPlayer = (p: any): PlayerRow => ({
  id: p.id, roomId: p.room_id, nickname: p.nickname, car: p.car, tokenHash: p.token_hash,
  progress: p.progress, solvedMask: p.solved_mask, lastCorrectAt: ms(p.last_correct_at),
  finishedAt: ms(p.finished_at), joinedAt: ms(p.joined_at)!, lastSeenAt: ms(p.last_seen_at)!,
  lastSubmitAt: ms(p.last_submit_at),
})

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`Supabase ${op} failed: ${error?.message ?? 'unknown error'}`)
}

export class SupabaseStore implements Store {
  private db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  async createRoom(code: string, teacherTokenHash: string) {
    const { data, error } = await this.db.from('rooms').insert({ code, teacher_token_hash: teacherTokenHash }).select().single()
    if (error) {
      if (error.code === '23505') return null
      fail('createRoom', error)
    }
    return toRoom(data)
  }

  async getRoomByCode(code: string) {
    const { data, error } = await this.db.from('rooms').select('*').eq('code', code).maybeSingle()
    if (error) fail('getRoomByCode', error)
    return data ? toRoom(data) : null
  }

  async updateRoom(id: string, patch: RoomPatch, guard?: RoomGuard) {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.currentQ !== undefined) row.current_q = patch.currentQ
    if (patch.qOpenedAt !== undefined) row.q_opened_at = iso(patch.qOpenedAt)
    if (patch.pausedAt !== undefined) row.paused_at = iso(patch.pausedAt)
    if (patch.pausedTotalMs !== undefined) row.paused_total_ms = patch.pausedTotalMs
    if (patch.showLeaderboard !== undefined) row.show_leaderboard = patch.showLeaderboard
    if (patch.revealed !== undefined) row.revealed = patch.revealed
    let q = this.db.from('rooms').update(row).eq('id', id)
    if (guard?.status) q = q.in('status', guard.status)
    if (guard?.currentQ !== undefined) q = q.eq('current_q', guard.currentQ)
    const { data, error } = await q.select()
    if (error) fail('updateRoom', error)
    return data && data.length > 0 ? toRoom(data[0]) : null
  }

  async addPlayer(p: { roomId: string; nickname: string; car: number; tokenHash: string }) {
    const { data, error } = await this.db
      .from('players')
      .insert({ room_id: p.roomId, nickname: p.nickname, car: p.car, token_hash: p.tokenHash })
      .select().single()
    if (error) {
      if (error.code === '23505') return 'duplicate_nickname' as const
      fail('addPlayer', error)
    }
    return toPlayer(data)
  }

  async getPlayer(roomId: string, playerId: string) {
    const { data, error } = await this.db.from('players').select('*').eq('id', playerId).eq('room_id', roomId).maybeSingle()
    if (error) fail('getPlayer', error)
    return data ? toPlayer(data) : null
  }

  async listPlayers(roomId: string) {
    const { data, error } = await this.db.from('players').select('*').eq('room_id', roomId)
    if (error) fail('listPlayers', error)
    return (data ?? []).map(toPlayer)
  }

  async touchPlayer(playerId: string, now: number) {
    const { error } = await this.db.from('players').update({ last_seen_at: iso(now) }).eq('id', playerId)
    if (error) fail('touchPlayer', error)
  }

  async claimSubmitSlot(playerId: string, now: number, minGapMs: number) {
    const { data, error } = await this.db
      .from('players')
      .update({ last_submit_at: iso(now) })
      .eq('id', playerId)
      .or(`last_submit_at.is.null,last_submit_at.lte.${iso(now - minGapMs)}`)
      .select('id')
    if (error) fail('claimSubmitSlot', error)
    return (data?.length ?? 0) > 0
  }

  async recordSubmission(roomId: string, s: SubmissionRow) {
    const { error } = await this.db.from('submissions').insert({
      room_id: roomId, player_id: s.playerId, question_idx: s.questionIdx,
      answer_text: s.answer, is_correct: s.isCorrect, created_at: iso(s.createdAt),
    })
    if (error) fail('recordSubmission', error)
  }

  async listSubmissions(roomId: string, questionIdx: number) {
    const { data, error } = await this.db
      .from('submissions').select('player_id,question_idx,answer_text,is_correct,created_at')
      .eq('room_id', roomId).eq('question_idx', questionIdx).order('created_at', { ascending: true })
    if (error) fail('listSubmissions', error)
    return (data ?? []).map((r: any) => ({
      playerId: r.player_id, questionIdx: r.question_idx, answer: r.answer_text,
      isCorrect: r.is_correct, createdAt: ms(r.created_at)!,
    }))
  }

  async advancePlayer(roomId: string, playerId: string, questionIdx: number, now: number) {
    const { data, error } = await this.db.rpc('advance_player', {
      p_room: roomId, p_player: playerId, p_q: questionIdx, p_now: iso(now),
    })
    if (error) fail('advancePlayer', error)
    const rows = Array.isArray(data) ? data : data ? [data] : []
    return rows.length > 0 ? toPlayer(rows[0]) : null
  }

  async resetRoom(roomId: string) {
    const { error } = await this.db.rpc('reset_room', { p_room: roomId })
    if (error) fail('resetRoom', error)
  }
}
