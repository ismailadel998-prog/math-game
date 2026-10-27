// End-to-end test: 1 teacher + 2 students in separate browser contexts against a running server.
// Usage: BASE_URL=http://localhost:3100 node scripts/e2e.mjs
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const { chromium } = createRequire(import.meta.url)('playwright')

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const SHOTS = 'test-results'
const Q = [
  ['6,755', '9', '60795'], ['869', '46', '39974'], ['922', '81', '74682'], ['783', '14', '10962'],
  ['684', '15', '10260'], ['650', '22', '14300'], ['2,525', '37', '93425'], ['615', '41', '25215'],
]
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)

const browser = await chromium.launch()
const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const [teacher, ava, ben] = await Promise.all([tctx.newPage(), actx.newPage(), bctx.newPage()])
const errors = []
for (const [n, p] of [['teacher', teacher], ['ava', ava], ['ben', ben]]) {
  p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${n}: ${m.text()}`) })
}

const txt = (p, sel) => p.locator(sel).first().innerText()
async function join(page, code, nick, carLabel) {
  await page.goto(`${BASE}/`)
  await page.fill('#room-code', code)
  await page.fill('input[aria-label="Your racing nickname"]', nick)
  await page.click(`button[aria-label="${carLabel} car"]`)
  await page.click('text=JOIN THE RACE')
  await page.waitForURL(`**/play/${code}`)
}
async function answer(page, value) {
  await page.fill('input[aria-label="Your answer"]', value)
  await page.click('text=SUBMIT ANSWER')
}
const teacherClick = async (label) => { await teacher.click(`button:has-text("${label}")`) }

await teacher.goto(`${BASE}/`)
await teacher.screenshot({ path: `${SHOTS}/00-home.png` })
// ── 1. teacher creates a room
await teacher.goto(`${BASE}/teacher`)
await teacher.click('text=CREATE ROOM')
await teacher.waitForURL('**/teacher/*')
await teacher.waitForSelector('.share-box .code')
const code = (await txt(teacher, '.share-box .code')).trim()
assert.match(code, /^[A-Z2-9]{4}$/)
ok(`teacher created room ${code}`)

// ── 2. students join with room code + nickname + car
await join(ava, code, 'Ava', 'Blaze')
await join(ben, code, 'Ben', 'Zoom')
await ava.waitForSelector('text=Get ready, Ava!')
await ben.waitForSelector('text=Get ready, Ben!')
await ava.screenshot({ path: `${SHOTS}/01-student-waiting.png` })
ok('students joined and are waiting for the teacher')
await teacher.waitForSelector('text=2 STUDENTS')
await teacher.screenshot({ path: `${SHOTS}/02-teacher-lobby.png`, fullPage: true })
ok('teacher sees both students join in real time')

// duplicate nickname refused
const dup = await (await browser.newContext()).newPage()
await dup.goto(`${BASE}/play/${code}`)
await dup.fill('input[aria-label="Your racing nickname"]', 'ava')
await dup.click('text=JOIN THE RACE')
await dup.waitForSelector('text=already taken')
ok('duplicate nickname is refused')
await dup.context().close()

// ── 3. teacher starts; everyone sees the same question
await teacherClick('START RACE')
for (const p of [ava, ben]) {
  await p.waitForSelector('.problem')
  assert.equal((await txt(p, '.problem span:nth-child(1)')).trim(), '6,755')
  assert.match(await txt(p, '.problem span:nth-child(2)'), /9/)
  assert.match(await txt(p, '.challenge-top'), /QUESTION 15/)
}
ok('both students see Question 15 (6,755 × 9)')
await ava.screenshot({ path: `${SHOTS}/03-student-race.png`, fullPage: true })
await ben.screenshot({ path: `${SHOTS}/04-student-race-mobile.png`, fullPage: true })

// ── 4. wrong answer → no advance; then correct
await answer(ava, '58,295')
await ava.waitForSelector('text=NOT QUITE!')
await ava.screenshot({ path: `${SHOTS}/05-feedback-wrong.png` })
assert.match(await txt(ava, '.feedback-road span'), /Checkpoint 0 of 8/)
await ava.click('text=TRY THIS QUESTION AGAIN')
ok('incorrect answer shows "Not quite", car stays at checkpoint 0')
await teacher.waitForSelector('text=× RETRY')
ok('teacher dashboard shows the incorrect submission')

await ava.waitForTimeout(700)
await answer(ava, '60,795')
await ava.waitForSelector('text=CORRECT!')
await ava.screenshot({ path: `${SHOTS}/06-feedback-correct.png` })
assert.match(await txt(ava, '.feedback-road span'), /Checkpoint 1 of 8/)
await ava.click('text=CONTINUE RACING')
await ava.waitForSelector('.solved-banner')
ok('correct answer (with comma) advances Ava to checkpoint 1 and shows the solved state')

await answer(ben, '60795')
await ben.waitForSelector('text=CORRECT!')
await ben.click('text=CONTINUE RACING')
ok('correct answer without comma accepted for Ben')

await teacher.waitForFunction(() => document.querySelectorAll('.answer-row .correct').length === 2)
await teacher.screenshot({ path: `${SHOTS}/07-teacher-running.png`, fullPage: true })
ok('teacher sees both answers marked correct')

// leaderboard: Ava was accepted first -> rank 1
await ava.waitForSelector('.leader-row.me')
const rows = await ava.locator('.leader-row .leader-name b').allInnerTexts()
assert.deepEqual(rows.map((r) => r.replace(' (you)', '')), ['Ava', 'Ben'])
ok('live leaderboard ranks Ava above Ben (earlier accepted answer)')

// ── 5. duplicate submission via the API cannot advance twice
const creds = await actx.pages()[0].evaluate((c) => JSON.parse(localStorage.getItem(`mr:player:${c}`)), code)
const post = (body, hdr = {}) => fetch(`${BASE}/api/rooms/${code}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...hdr }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }))
const ah = { 'x-player-id': creds.playerId, 'x-player-token': creds.playerToken }
const dups = await Promise.all(Array.from({ length: 6 }, () => post({ questionIndex: 0, answer: '60795' }, ah)))
assert.ok(dups.every((d) => d.body.result === 'already_solved'), JSON.stringify(dups))
ok('6 parallel duplicate submissions → all "already_solved", no extra advance')
assert.equal((await post({ questionIndex: 0, answer: '60795' })).status, 401)
assert.equal((await post({ questionIndex: 0, answer: '60795' }, { 'x-player-id': creds.playerId, 'x-player-token': 'forged' })).status, 401)
ok('unauthenticated / forged submissions are rejected (401)')
const ctl = await fetch(`${BASE}/api/rooms/${code}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...ah }, body: JSON.stringify({ action: 'end' }) })
assert.equal(ctl.status, 401)
ok('a student cannot use teacher controls (401)')
const stateJson = await (await fetch(`${BASE}/api/rooms/${code}/state`, { headers: ah })).text()
for (const [, , a] of Q) assert.ok(!stateJson.includes(a), `answer ${a} leaked in state`)
ok('state API response contains no answers')

// ── 6. teacher advances; stale answers rejected
await teacherClick('NEXT QUESTION')
await ava.waitForSelector('text=QUESTION 16')
assert.equal((await post({ questionIndex: 0, answer: '60795' }, ah)).body.result, 'stale')
assert.equal((await post({ questionIndex: 2, answer: '74682' }, ah)).body.result, 'stale') // skipping ahead
ok('teacher opened Q16 for everyone; stale and skip-ahead submissions refused')

// ── 7. pause blocks answers, resume restores
await teacherClick('PAUSE')
await ava.waitForSelector('text=The teacher paused the race')
assert.ok(await ava.locator('input[aria-label="Your answer"]').isDisabled())
assert.equal((await post({ questionIndex: 1, answer: '39974' }, ah)).body.result, 'paused')
await ava.screenshot({ path: `${SHOTS}/08-student-paused.png`, fullPage: true })
ok('while paused: input disabled and server refuses a correct answer')
await teacherClick('RESUME RACE')
await ava.waitForSelector('text=The teacher paused the race', { state: 'detached' })
ok('resume re-enables answering, progress intact')

// ── 8. reconnection: reload + offline/online
await ben.reload()
await ben.waitForSelector('.problem')
assert.match(await txt(ben, '.track-labels'), /✓/)
ok('Ben reloaded the page and recovered his progress (checkpoint 1)')
await bctx.setOffline(true)
await ben.waitForSelector('text=reconnecting', { timeout: 15000 })
await bctx.setOffline(false)
await ben.waitForSelector('text=reconnecting', { state: 'detached', timeout: 15000 })
ok('connection loss shows a banner, then recovers automatically')

// ── 9. play Q16–Q22 for both through the UI
for (let i = 1; i < 8; i++) {
  if (i > 1) {
    await teacherClick('NEXT QUESTION')
    await ava.waitForSelector(`.challenge-top:has-text("QUESTION ${15 + i}")`)
    await ben.waitForSelector(`.challenge-top:has-text("QUESTION ${15 + i}")`)
  }
  assert.equal((await txt(ava, '.problem span:nth-child(1)')).trim(), Q[i][0])
  for (const p of [ava, ben]) {
    await p.waitForTimeout(600)
    await answer(p, String(Number(Q[i][2]) + 1)) // wrong first
    await p.waitForSelector('text=NOT QUITE!')
    await p.click('text=TRY THIS QUESTION AGAIN')
    await p.waitForTimeout(600)
    await answer(p, Q[i][2])
    await p.waitForSelector(i === 7 ? 'text=YOU CROSSED THE FINISH LINE!' : 'text=CORRECT!')
    if (i < 7) await p.click('text=CONTINUE RACING')
  }
  if (i === 7) await ava.screenshot({ path: `${SHOTS}/09-feedback-finish.png` })
}
ok('all 8 questions (15–22): wrong answer rejected, correct answer accepted, for both students')

// ── 10. winner screen & final rankings
await ava.click('text=SEE RESULTS')
await ben.click('text=SEE RESULTS')
for (const p of [ava, ben, teacher]) {
  await p.waitForSelector('text=CHAMPION!')
  await p.waitForSelector('text=FINAL RANKINGS')
}
const final = (await ava.locator('.final-list .leader-row .leader-name b').allInnerTexts()).map((s) => s.replace(' (you)', ''))
assert.deepEqual(final, ['Ava', 'Ben'])
assert.match(await txt(ava, '.final-list'), /8 of 8 solved/)
await ava.waitForTimeout(2200) // let podium + confetti animations play
await ava.screenshot({ path: `${SHOTS}/10-winner.png` })
await ben.screenshot({ path: `${SHOTS}/11-winner-mobile.png` })
await teacher.screenshot({ path: `${SHOTS}/12-teacher-results.png` })
ok('winner screen + final rankings shown to students and teacher (Ava 1st, Ben 2nd, 8/8)')

// ── 11. reset with confirmation
await teacher.click('text=RESET & RACE AGAIN')
await teacher.waitForSelector('role=dialog')
await teacher.click('button:has-text("Cancel")')
await teacher.waitForSelector('role=dialog', { state: 'detached' })
await teacher.click('text=RESET & RACE AGAIN')
await teacher.click('role=dialog >> text=Reset race')
await teacher.waitForSelector('text=WAITING FOR STUDENTS')
await ava.waitForSelector('text=Get ready, Ava!')
ok('reset requires confirmation, then returns everyone to the lobby')

// ── 12. leaderboard hide toggle
await teacherClick('START RACE')
await ava.waitForSelector('.problem')
await teacher.click('[role=switch]')
await ava.waitForFunction(() => !document.querySelector('.leader'))
ok('teacher hides the leaderboard → students no longer see rankings')

assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`)
ok('no browser console errors')
await browser.close()
console.log(`\nE2E PASSED (${step} checks). Screenshots in ./${SHOTS}`)
