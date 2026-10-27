import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

let db: PGlite
const T = '2026-01-01T10:00:00Z'

async function room(status: string, q = 0) {
  const r = await db.query<{ id: string }>(
    `insert into rooms (code, teacher_token_hash, status, current_q) values ($1,'h',$2,$3) returning id`,
    [Math.random().toString(36).slice(2, 6), status, q],
  )
  return r.rows[0].id
}
async function player(roomId: string, nick: string) {
  const r = await db.query<{ id: string }>(`insert into players (room_id, nickname, car, token_hash) values ($1,$2,0,'x') returning id`, [roomId, nick])
  return r.rows[0].id
}
const advance = (r: string, p: string, q: number) =>
  db.query<{ progress: number; solved_mask: number }>(`select * from advance_player($1,$2,$3,$4)`, [r, p, q, T])

describe('supabase/migrations/0001_init.sql (run on real Postgres via PGlite)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create role service_role; create role anon; create role authenticated;`)
    await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/0002_reveal.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/0003_one_attempt.sql', 'utf8'))
  })

  it('migrations are re-runnable (idempotent)', async () => {
    await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/0002_reveal.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/0003_one_attempt.sql', 'utf8'))
  })

  it('0003: fail_player locks a question once; afterwards neither fail nor advance can succeed', async () => {
    const r = await room('running', 3)
    const p = await player(r, 'Ava')
    const fail = () => db.query(`select * from fail_player($1,$2,$3)`, [r, p, 3])
    expect((await fail()).rows).toHaveLength(1)
    expect((await fail()).rows).toHaveLength(0)            // second wrong answer: no-op
    expect((await advance(r, p, 3)).rows).toHaveLength(0)  // correct answer after a wrong one: refused
    const row = await db.query<{ progress: number; failed_mask: number }>(`select progress, failed_mask from players where id=$1`, [p])
    expect(row.rows[0]).toEqual({ progress: 0, failed_mask: 8 })
  })

  it('0003: a correct answer first means a later wrong answer cannot lock; other questions unaffected', async () => {
    const r = await room('running', 1)
    const p = await player(r, 'Ava')
    expect((await advance(r, p, 1)).rows).toHaveLength(1)
    expect((await db.query(`select * from fail_player($1,$2,$3)`, [r, p, 1])).rows).toHaveLength(0)
    await db.query(`update rooms set current_q = 2 where id=$1`, [r])
    expect((await db.query(`select * from fail_player($1,$2,$3)`, [r, p, 2])).rows).toHaveLength(1)
    expect((await db.query(`select * from fail_player($1,$2,$3)`, [r, p, 1])).rows).toHaveLength(0) // not the active question
  })

  it('0003: fail_player refused when not running / revealed / other room; reset clears failed_mask', async () => {
    const paused = await room('paused', 0); const pp = await player(paused, 'A')
    expect((await db.query(`select * from fail_player($1,$2,0)`, [paused, pp])).rows).toHaveLength(0)
    const rev = await room('running', 0); const pr = await player(rev, 'A')
    await db.query(`update rooms set revealed=true where id=$1`, [rev])
    expect((await db.query(`select * from fail_player($1,$2,0)`, [rev, pr])).rows).toHaveLength(0)
    const r1 = await room('running', 0); const r2 = await room('running', 0); const p2 = await player(r2, 'Z')
    expect((await db.query(`select * from fail_player($1,$2,0)`, [r1, p2])).rows).toHaveLength(0)
    const p = await player(r1, 'Ava')
    await db.query(`select * from fail_player($1,$2,0)`, [r1, p])
    await db.query(`select reset_room($1)`, [r1])
    const row = await db.query<{ failed_mask: number }>(`select failed_mask from players where id=$1`, [p])
    expect(row.rows[0].failed_mask).toBe(0)
  })

  it('0002: advance_player is refused once the answer is revealed; reset_room clears it', async () => {
    const r = await room('running', 0)
    const p = await player(r, 'Ava')
    await db.query(`update rooms set revealed = true where id = $1`, [r])
    expect((await advance(r, p, 0)).rows).toHaveLength(0)
    await db.query(`select reset_room($1)`, [r])
    const row = await db.query<{ revealed: boolean }>(`select revealed from rooms where id=$1`, [r])
    expect(row.rows[0].revealed).toBe(false)
    await db.query(`update rooms set status='running' where id=$1`, [r])
    expect((await advance(r, p, 0)).rows).toHaveLength(1)
  })

  it('advance_player moves exactly one checkpoint and sets the solved bit + timestamps', async () => {
    const r = await room('running', 2)
    const p = await player(r, 'Ava')
    const a = await advance(r, p, 2)
    expect(a.rows).toHaveLength(1)
    expect(a.rows[0]).toMatchObject({ progress: 1, solved_mask: 4 })
  })

  it('duplicate advance for the same question is refused', async () => {
    const r = await room('running', 0)
    const p = await player(r, 'Ava')
    expect((await advance(r, p, 0)).rows).toHaveLength(1)
    expect((await advance(r, p, 0)).rows).toHaveLength(0)
    const row = await db.query<{ progress: number }>(`select progress from players where id=$1`, [p])
    expect(row.rows[0].progress).toBe(1)
  })

  it('refused when paused, in lobby, finished, or for a non-active question', async () => {
    for (const status of ['paused', 'lobby', 'finished']) {
      const r = await room(status, 0)
      const p = await player(r, 'Ava')
      expect((await advance(r, p, 0)).rows, status).toHaveLength(0)
    }
    const r = await room('running', 3)
    const p = await player(r, 'Ava')
    expect((await advance(r, p, 2)).rows).toHaveLength(0) // stale
    expect((await advance(r, p, 4)).rows).toHaveLength(0) // skip ahead
  })

  it("refused for a player of a different room", async () => {
    const r1 = await room('running', 0)
    const r2 = await room('running', 0)
    const p2 = await player(r2, 'Zed')
    expect((await advance(r1, p2, 0)).rows).toHaveLength(0)
  })

  it('8th checkpoint sets finished_at; progress can never exceed 8', async () => {
    const r = await room('running', 0)
    const p = await player(r, 'Ava')
    for (let q = 0; q < 8; q++) {
      await db.query(`update rooms set current_q=$2 where id=$1`, [r, q])
      expect((await advance(r, p, q)).rows).toHaveLength(1)
    }
    const row = await db.query<{ progress: number; finished_at: string | null }>(`select progress, finished_at from players where id=$1`, [p])
    expect(row.rows[0].progress).toBe(8)
    expect(row.rows[0].finished_at).not.toBeNull()
  })

  it('nicknames are unique per room, case-insensitively', async () => {
    const r = await room('lobby')
    await player(r, 'Ava')
    await expect(player(r, 'AVA')).rejects.toThrow()
    const other = await room('lobby')
    await player(other, 'Ava') // fine in another room
  })

  it('reset_room clears progress and submissions and returns the room to the lobby', async () => {
    const r = await room('running', 5)
    const p = await player(r, 'Ava')
    await db.query(`update rooms set q_opened_at=now(), paused_total_ms=500 where id=$1`, [r])
    await advance(r, p, 5)
    await db.query(`insert into submissions (room_id, player_id, question_idx, answer_text, is_correct) values ($1,$2,5,'1',false)`, [r, p])
    await db.query(`select reset_room($1)`, [r])
    const pr = await db.query<{ progress: number; solved_mask: number; finished_at: unknown }>(`select progress, solved_mask, finished_at from players where id=$1`, [p])
    expect(pr.rows[0]).toMatchObject({ progress: 0, solved_mask: 0, finished_at: null })
    const rr = await db.query<{ status: string; current_q: number; paused_total_ms: string }>(`select status, current_q, paused_total_ms from rooms where id=$1`, [r])
    expect(rr.rows[0]).toMatchObject({ status: 'lobby', current_q: 0 })
    const sub = await db.query(`select 1 from submissions where room_id=$1`, [r])
    expect(sub.rows).toHaveLength(0)
  })

  it('RLS is enabled with no policies on every table (anon key can read nothing)', async () => {
    const t = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('rooms','players','submissions') and relkind='r' order by 1`)
    expect(t.rows.map((x) => x.relrowsecurity)).toEqual([true, true, true])
    const pol = await db.query(`select 1 from pg_policies where schemaname='public'`)
    expect(pol.rows).toHaveLength(0)
  })

  it('anon / authenticated roles cannot execute the game functions', async () => {
    const rows = await db.query<{ a: boolean; s: boolean }>(`
      select has_function_privilege('anon','public.advance_player(uuid,uuid,int,timestamptz)','execute') as a,
             has_function_privilege('service_role','public.advance_player(uuid,uuid,int,timestamptz)','execute') as s`)
    expect(rows.rows[0]).toEqual({ a: false, s: true })
  })
})
