import { beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_QUESTIONS } from '../lib/shared'
import { correctAnswerFor, parseAnswer } from '../lib/server/answers'
import { MemoryStore } from '../lib/server/memory-store'
import { control, createRoom, getState, joinRoom, rankPlayers, submitAnswer, MIN_SUBMIT_GAP_MS, GameError } from '../lib/server/game'
import type { Store } from '../lib/server/types'

// The eight answers from the assignment, written independently of the code under test.
const SPEC: [number, number, number, number][] = [
  [15, 6755, 9, 60795], [16, 869, 46, 39974], [17, 922, 81, 74682], [18, 783, 14, 10962],
  [19, 684, 15, 10260], [20, 650, 22, 14300], [21, 2525, 37, 93425], [22, 615, 41, 25215],
]

describe('answer key', () => {
  it('matches the assignment AND the arithmetic for all 8 questions', () => {
    SPEC.forEach(([num, a, b, ans], i) => {
      expect(a * b).toBe(ans)
      expect(correctAnswerFor(i)).toBe(ans)
      const q = PUBLIC_QUESTIONS[i]
      expect(q.number).toBe(num)
      expect(Number(q.top.replace(/,/g, ''))).toBe(a)
      expect(Number(q.bottom)).toBe(b)
    })
    expect(PUBLIC_QUESTIONS.map((q) => q.number)).toEqual([15, 16, 17, 18, 19, 20, 21, 22])
  })

  it('parses answers with or without thousands separators; rejects junk', () => {
    expect(parseAnswer('60795')).toBe(60795)
    expect(parseAnswer('60,795')).toBe(60795)
    expect(parseAnswer('  60 795 ')).toBe(60795)
    expect(parseAnswer('2525')).toBe(2525)
    for (const bad of ['', 'abc', '60,79,5', '6,0795', '1.5', '-5', '1e5', '60795x', '0x10', ',795', '99999999999999999999']) {
      expect(parseAnswer(bad), bad).toBeNull()
    }
  })
})

describe('race engine', () => {
  let store: Store
  let t: number
  const tick = (ms = MIN_SUBMIT_GAP_MS + 1) => (t += ms)

  async function setup(nicks = ['Ava', 'Ben']) {
    const { code, teacherToken } = await createRoom(store, null)
    const teacher = { teacherToken }
    const ps = []
    for (const [i, n] of nicks.entries()) {
      const j = await joinRoom(store, code, n, i)
      ps.push({ ...j, creds: { playerId: j.playerId, playerToken: j.playerToken } })
    }
    return { code, teacher, ps }
  }
  const answerOf = (i: number) => String(SPEC[i][3])

  beforeEach(() => { store = new MemoryStore(); t = 1_000_000 })

  it('does not expose answers or questions before the race starts, nor any answer ever', async () => {
    const { code, teacher, ps } = await setup()
    const lobby = await getState(store, code, ps[0].creds, t)
    expect(lobby.room.question).toBeNull()
    await control(store, code, teacher, { action: 'start' }, t)
    const running = await getState(store, code, ps[0].creds, t)
    expect(running.room.question).toEqual(PUBLIC_QUESTIONS[0])
    const dump = JSON.stringify([lobby, running, await getState(store, code, teacher, t)])
    for (const [, , , ans] of SPEC) expect(dump).not.toContain(String(ans))
  })

  it('accepts every correct answer, one checkpoint each, through Q15–Q22, then finishes', async () => {
    const { code, teacher, ps } = await setup(['Solo'])
    await control(store, code, teacher, { action: 'start' }, t)
    for (let i = 0; i < 8; i++) {
      const res = await submitAnswer(store, code, ps[0].creds, { questionIndex: i, answer: i % 2 ? answerOf(i) : Number(answerOf(i)).toLocaleString('en-US') }, tick())
      expect(res).toMatchObject({ result: 'correct', progress: i + 1 })
      if (i < 7) await control(store, code, teacher, { action: 'next', fromQ: i }, tick())
    }
    const s = await getState(store, code, ps[0].creds, t)
    expect(s.me?.progress).toBe(8)
    expect(s.room.status).toBe('finished') // everyone finished → auto-finish
  })

  it('one attempt only: a wrong answer locks the question, shows the correct answer, and never advances the car', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    const before = await getState(store, code, ps[0].creds, t)
    expect(before.me).toMatchObject({ failedCurrent: false, missedAnswer: null })

    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: '60796' }, tick()))
      .toEqual({ result: 'incorrect', correctAnswer: '6,755 × 9 = 60,795' })
    // no retry: even the correct answer is now refused, and so is another wrong one
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: '60,795' }, tick()))
      .toEqual({ result: 'already_failed', correctAnswer: '6,755 × 9 = 60,795' })
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: '1' }, tick()))
      .toMatchObject({ result: 'already_failed' })
    const after = await getState(store, code, ps[0].creds, t)
    expect(after.me).toMatchObject({ progress: 0, failedCurrent: true, missedAnswer: '6,755 × 9 = 60,795' })

    // the other student is unaffected and still can't see the answer
    const other = await getState(store, code, ps[1].creds, t)
    expect(other.me).toMatchObject({ failedCurrent: false, missedAnswer: null })
    expect(JSON.stringify(other)).not.toContain('60,795')
    expect(await submitAnswer(store, code, ps[1].creds, { questionIndex: 0, answer: '60795' }, tick())).toMatchObject({ result: 'correct', progress: 1 })

    // next question: a fresh single attempt
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())
    const q16 = await getState(store, code, ps[0].creds, t)
    expect(q16.me).toMatchObject({ failedCurrent: false, missedAnswer: null })
    expect(JSON.stringify(q16)).not.toContain('60,795')
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toMatchObject({ result: 'correct', progress: 1 })
  })

  it('one attempt only: a wrong and a correct submission sent at the same instant produce exactly one outcome', async () => {
    for (const order of ['wrong-first', 'correct-first'] as const) {
      const { code, teacher, ps } = await setup(['Solo'])
      await control(store, code, teacher, { action: 'start' }, t)
      const now = tick()
      // bypass the per-player rate limit so both really race the atomic step
      await store.claimSubmitSlot(ps[0].playerId, 0, 0)
      const calls = order === 'wrong-first' ? ['60796', answerOf(0)] : [answerOf(0), '60796']
      const results = await Promise.all(calls.map((a) => submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: a }, now + 1_000)))
      const s = await getState(store, code, ps[0].creds, now + 2_000)
      const advanced = results.some((r) => r.result === 'correct')
      // never both: progress 1 XOR failed
      expect(s.me!.progress === 1 ? !s.me!.failedCurrent : s.me!.failedCurrent).toBe(true)
      expect(advanced).toBe(s.me!.progress === 1)
    }
  })

  it('invalid (non-numeric) input is not an attempt', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await expect(submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: 'sixty' }, tick())).rejects.toMatchObject({ status: 400 })
    expect((await getState(store, code, ps[0].creds, t)).me).toMatchObject({ failedCurrent: false })
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toMatchObject({ result: 'correct' })
  })

  it('malformed answers are rejected with 400 and not recorded', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await expect(submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: 'abc' }, tick())).rejects.toMatchObject({ status: 400 })
    const s = await getState(store, code, teacher, t)
    expect(s.answers!.find((a) => a.nickname === 'Ava')!.attempts).toBe(0)
  })

  it('duplicate / concurrent correct submissions advance exactly once', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    const now = tick()
    const results = await Promise.all(
      Array.from({ length: 10 }, () => submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, now)),
    )
    expect(results.filter((r) => r.result === 'correct')).toHaveLength(1)
    expect((await getState(store, code, ps[0].creds, t)).me?.progress).toBe(1)
    // and a later re-submit
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toMatchObject({ result: 'already_solved', progress: 1 })
    expect((await getState(store, code, ps[0].creds, t)).me?.progress).toBe(1)
  })

  it('rate limiter: a second submission within the minimum gap is refused (atomic slot claim)', async () => {
    const { ps } = await setup()
    const now = tick()
    expect(await store.claimSubmitSlot(ps[0].playerId, now, MIN_SUBMIT_GAP_MS)).toBe(true)
    expect(await store.claimSubmitSlot(ps[0].playerId, now + 10, MIN_SUBMIT_GAP_MS)).toBe(false)
    expect(await store.claimSubmitSlot(ps[1].playerId, now + 10, MIN_SUBMIT_GAP_MS)).toBe(true) // per player
    expect(await store.claimSubmitSlot(ps[0].playerId, now + MIN_SUBMIT_GAP_MS + 1, MIN_SUBMIT_GAP_MS)).toBe(true)
  })

  it('prevents skipping: only the active question is accepted; stale requests are refused', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    // answering Q16 (correctly!) while Q15 is active must not advance
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toEqual({ result: 'stale' })
    expect((await getState(store, code, ps[0].creds, t)).me?.progress).toBe(0)
    // teacher moves on; a late answer for Q15 is stale
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toEqual({ result: 'stale' })
    expect((await getState(store, code, ps[0].creds, t)).me?.progress).toBe(0)
    // a question can be solved only once even if the teacher re-opens it
    expect(await submitAnswer(store, code, ps[1].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toMatchObject({ result: 'correct', progress: 1 })
    await control(store, code, teacher, { action: 'goto', index: 1 }, tick())
    expect(await submitAnswer(store, code, ps[1].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toMatchObject({ result: 'already_solved' })
    expect((await getState(store, code, ps[1].creds, t)).me?.progress).toBe(1)
  })

  it('teacher "next" is idempotent against double clicks (fromQ guard)', async () => {
    const { code, teacher } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())
    await expect(control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())).rejects.toMatchObject({ status: 409 })
    expect((await getState(store, code, teacher, t)).room.currentQ).toBe(1)
    await control(store, code, teacher, { action: 'goto', index: 7 }, tick())
    await expect(control(store, code, teacher, { action: 'next', fromQ: 7 }, tick())).rejects.toMatchObject({ code: 'last_question' })
  })

  it('pause blocks answers, resume restores them with progress and timer intact', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    const start = t
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toMatchObject({ result: 'correct' })
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())
    const opened = t
    await control(store, code, teacher, { action: 'pause' }, tick(10_000))
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toEqual({ result: 'paused' })
    const paused = await getState(store, code, ps[0].creds, tick(30_000))
    expect(paused.room.status).toBe('paused')
    expect(paused.room.elapsedMs).toBe(10_000) // clock frozen while paused
    expect(paused.me?.progress).toBe(1)
    await control(store, code, teacher, { action: 'resume' }, t)
    const resumed = await getState(store, code, ps[0].creds, tick(5_000))
    expect(resumed.room.status).toBe('running')
    expect(resumed.room.elapsedMs).toBeGreaterThanOrEqual(15_000 - 600) // 10s + 5s, pause time excluded
    expect(resumed.room.elapsedMs).toBeLessThan(15_000 + 2_000)
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toMatchObject({ result: 'correct', progress: 2 })
    expect(start).toBeLessThan(opened)
  })

  it('refuses answers in the lobby and after the race ends', async () => {
    const { code, teacher, ps } = await setup()
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toEqual({ result: 'not_running' })
    await control(store, code, teacher, { action: 'start' }, t)
    await control(store, code, teacher, { action: 'end' }, tick())
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toEqual({ result: 'not_running' })
    expect((await getState(store, code, ps[0].creds, t)).room.status).toBe('finished')
  })

  it('reconnecting with the saved credentials recovers progress; bad credentials are refused', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())
    // "new browser session": only the stored id+token are used
    const again = await getState(store, code, { playerId: ps[0].playerId, playerToken: ps[0].playerToken }, tick(60_000))
    expect(again.me).toMatchObject({ nickname: 'Ava', progress: 1, solvedCurrent: false })
    expect(again.room.currentQ).toBe(1)
    await expect(getState(store, code, { playerId: ps[0].playerId, playerToken: 'wrong' }, t)).rejects.toMatchObject({ status: 401 })
    await expect(getState(store, code, { playerId: 'nope', playerToken: ps[0].playerToken }, t)).rejects.toMatchObject({ status: 401 })
  })

  it('enforces room membership and blocks teacher impersonation', async () => {
    const A = await setup(['Ava'])
    const B = await setup(['Zed'])
    await control(store, A.code, A.teacher, { action: 'start' }, t)
    await control(store, B.code, B.teacher, { action: 'start' }, t)
    // a player from room B cannot act in room A
    await expect(submitAnswer(store, A.code, B.ps[0].creds, { questionIndex: 0, answer: '1' }, tick())).rejects.toMatchObject({ status: 401 })
    await expect(getState(store, A.code, B.ps[0].creds, t)).rejects.toMatchObject({ status: 401 })
    // students and other teachers cannot use teacher controls
    for (const creds of [{}, { teacherToken: 'guess' }, { teacherToken: B.teacher.teacherToken }, { playerId: A.ps[0].playerId, playerToken: A.ps[0].playerToken }]) {
      for (const action of [{ action: 'pause' }, { action: 'next', fromQ: 0 }, { action: 'end' }, { action: 'reset', confirm: true }] as const) {
        await expect(control(store, A.code, creds, action, t), JSON.stringify(creds)).rejects.toMatchObject({ status: 401 })
      }
    }
    await expect(getState(store, A.code, { teacherToken: 'guess' }, t)).rejects.toMatchObject({ status: 401 })
    // student state never contains the teacher answer table
    expect((await getState(store, A.code, A.ps[0].creds, t)).answers).toBeNull()
  })

  it('ranks by checkpoints, then by server time of the accepted answer — not typing speed', async () => {
    const { code, teacher, ps } = await setup(['Ava', 'Ben', 'Cy'])
    await control(store, code, teacher, { action: 'start' }, t)
    // Ben's accepted answer is recorded earlier than Ava's => Ben ranks higher at equal progress
    await submitAnswer(store, code, ps[1].creds, { questionIndex: 0, answer: answerOf(0) }, 2_000_000)
    await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, 2_000_500)
    let s = await getState(store, code, teacher, 2_001_000)
    expect(s.players!.map((p) => p.nickname)).toEqual(['Ben', 'Ava', 'Cy'])
    expect(s.players!.map((p) => p.rank)).toEqual([1, 2, 3])
    // more progress beats earlier time
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, 2_002_000)
    await submitAnswer(store, code, ps[0].creds, { questionIndex: 1, answer: answerOf(1) }, 2_003_000)
    s = await getState(store, code, teacher, 2_004_000)
    expect(s.players!.map((p) => p.nickname)).toEqual(['Ava', 'Ben', 'Cy'])
  })

  it('rankPlayers: finishers ordered by completion time', () => {
    const base = { roomId: 'r', car: 0, tokenHash: '', solvedMask: 255, failedMask: 0, joinedAt: 1, lastSeenAt: 1, lastSubmitAt: null, nickname: 'x' }
    const ranked = rankPlayers([
      { ...base, id: 'slow', progress: 8, lastCorrectAt: 900, finishedAt: 900 },
      { ...base, id: 'fast', progress: 8, lastCorrectAt: 100, finishedAt: 100 },
      { ...base, id: 'mid', progress: 7, lastCorrectAt: 50, finishedAt: null },
    ])
    expect(ranked.map((p) => p.id)).toEqual(['fast', 'slow', 'mid'])
  })

  it('leaderboard visibility: hidden from students (not teacher) when toggled off; finals always shown', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await control(store, code, teacher, { action: 'toggle_leaderboard' }, t)
    const stu = await getState(store, code, ps[0].creds, t)
    expect(stu.players).toBeNull()
    expect(stu.me?.rank).toBeNull()
    expect((await getState(store, code, teacher, t)).players).toHaveLength(2)
    await control(store, code, teacher, { action: 'end' }, tick())
    expect((await getState(store, code, ps[0].creds, t)).players).toHaveLength(2)
  })

  it('teacher sees submitted answers and correctness for the active question', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: '58,295' }, tick())
    await submitAnswer(store, code, ps[1].creds, { questionIndex: 0, answer: '60,795' }, tick())
    const rows = (await getState(store, code, teacher, t)).answers!
    expect(rows.find((r) => r.nickname === 'Ava')).toMatchObject({ answer: '58,295', correct: false, attempts: 1, solved: false, failed: true })
    expect(rows.find((r) => r.nickname === 'Ben')).toMatchObject({ answer: '60,795', correct: true, solved: true })
  })

  it('reset requires confirmation and returns everyone to the lobby at zero', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())
    await expect(control(store, code, teacher, { action: 'reset' } as never, t)).rejects.toMatchObject({ code: 'confirm_required' })
    await control(store, code, teacher, { action: 'reset', confirm: true }, t)
    const s = await getState(store, code, ps[0].creds, t)
    expect(s.room).toMatchObject({ status: 'lobby', currentQ: 0, question: null })
    expect(s.me).toMatchObject({ progress: 0, solvedCurrent: false })
    await control(store, code, teacher, { action: 'start' }, tick())
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toMatchObject({ result: 'correct', progress: 1 })
  })

  it('reveal: answer is hidden until the teacher reveals it, then the question is closed; next question re-hides', async () => {
    const { code, teacher, ps } = await setup()
    await control(store, code, teacher, { action: 'start' }, t)
    await submitAnswer(store, code, ps[1].creds, { questionIndex: 0, answer: answerOf(0) }, tick())
    expect((await getState(store, code, ps[0].creds, t)).room.revealedAnswer).toBeNull()
    // only the teacher can reveal
    await expect(control(store, code, ps[0].creds, { action: 'reveal' }, t)).rejects.toMatchObject({ status: 401 })
    expect((await getState(store, code, ps[0].creds, t)).room.revealedAnswer).toBeNull()

    await control(store, code, teacher, { action: 'reveal' }, tick())
    for (const creds of [ps[0].creds, teacher]) {
      expect((await getState(store, code, creds, t)).room.revealedAnswer).toBe('6,755 × 9 = 60,795')
    }
    // closed: even a correct answer from the student who hadn't answered is refused, no advance
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toEqual({ result: 'revealed' })
    expect((await getState(store, code, ps[0].creds, t)).me?.progress).toBe(0)

    // next question: hidden again, and answering works again; the Q15 answer is not in Q16 state
    await control(store, code, teacher, { action: 'next', fromQ: 0 }, tick())
    const q16 = await getState(store, code, ps[0].creds, t)
    expect(q16.room.revealedAnswer).toBeNull()
    expect(JSON.stringify(q16)).not.toContain('60,795')
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 1, answer: answerOf(1) }, tick())).toMatchObject({ result: 'correct' })
  })

  it('reveal is refused in the lobby and cleared by reset', async () => {
    const { code, teacher, ps } = await setup()
    await expect(control(store, code, teacher, { action: 'reveal' }, t)).rejects.toMatchObject({ status: 409 })
    await control(store, code, teacher, { action: 'start' }, t)
    await control(store, code, teacher, { action: 'reveal' }, tick())
    await control(store, code, teacher, { action: 'reset', confirm: true }, tick())
    await control(store, code, teacher, { action: 'start' }, tick())
    expect((await getState(store, code, ps[0].creds, t)).room.revealedAnswer).toBeNull()
    expect(await submitAnswer(store, code, ps[0].creds, { questionIndex: 0, answer: answerOf(0) }, tick())).toMatchObject({ result: 'correct' })
  })

  it('nicknames: unique per room (case-insensitive), validated', async () => {
    const { code } = await setup(['Ava'])
    await expect(joinRoom(store, code, 'ava', 1)).rejects.toMatchObject({ code: 'nickname_taken' })
    await expect(joinRoom(store, code, '   ', 1)).rejects.toBeInstanceOf(GameError)
    await expect(joinRoom(store, code, 'x'.repeat(40), 1)).rejects.toMatchObject({ status: 400 })
    await expect(joinRoom(store, code, '<script>', 1)).rejects.toMatchObject({ status: 400 })
    await expect(joinRoom(store, code, 'Ok', 9)).rejects.toMatchObject({ code: 'bad_car' })
    await expect(joinRoom(store, 'ZZZZ', 'Ok', 1)).rejects.toMatchObject({ status: 404 })
    expect((await joinRoom(store, `race-${code.toLowerCase()}`, 'Cy', 2)).code).toBe(code) // code is forgiving
  })
})
