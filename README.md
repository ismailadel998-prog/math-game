# Multiplication Race

A live, multiplayer Grade 5 multiplication racing game (Questions 15–22), built from the
Figma Make design *"Multiplication Race Game"*. A teacher creates a room, students join from
any device with a 4-letter code, solve each problem on paper, type the answer, and their car
advances only when the **server** confirms the answer is correct.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Framer Motion ·
Supabase (Postgres + Realtime, free tier) · deploys on Vercel.

---

## How it works

```
 Student / Teacher browser ──HTTPS──▶ Next.js API routes (Vercel) ──service_role──▶ Supabase Postgres
            ▲                                   │  (all rules + answer key live here)
            └──── Supabase Realtime "changed" ping ◀──┘   (carries no data; clients refetch)
```

* **Server-authoritative.** Every rule (is the race running? is this the active question? was it
  already solved? is the answer right?) is enforced in `lib/server/game.ts`. The browser only
  displays state.
* **Answer key is server-only.** `lib/server/answers.ts` imports `server-only`; the answers are not in
  the database, not in any API response, and not in any JavaScript sent to browsers (verified by
  grepping the production client bundle).
* **Locked database.** All tables have Row Level Security enabled with *no* policies, so the public
  `anon` key can read/write nothing. Only the server (secret `service_role` key) touches data.
* **Atomic progress.** `advance_player()` (SQL function) moves a car exactly one checkpoint, and only if
  the room is running, the question is the active one, and the student hasn't solved it. Ten parallel
  duplicate submissions produce one advance.
* **Real-time.** After each change the server sends a tiny Supabase Realtime broadcast; clients refetch
  instantly. Clients also poll (every 4 s, or 1.5 s without Realtime) and refetch on tab focus / network
  recovery, so a dropped connection heals itself.
* **Ranking** = checkpoints reached (desc) → server timestamp when that checkpoint was accepted (asc; for
  finishers, their completion time) → join order. Typing speed never matters.
* **Teacher auth.** Creating a room returns a random teacher token (only its SHA-256 hash is stored).
  Students receive a per-player token the same way. Optional `TEACHER_PASSCODE` stops students from
  creating rooms.

### Game rules implemented

| Rule | Where |
|---|---|
| Same question, same order for everyone; teacher opens questions | `control` → `next` / `goto` |
| Only the **active** question can be answered; no skipping ahead, no late answers | `submitAnswer` → `stale` |
| **One attempt per question.** A wrong answer locks that question for the student, shows them the correct answer and tells them to write it in their math book (no retry). Never advances the car | `submitAnswer`, SQL `fail_player` |
| Correct answer = exactly **+1** checkpoint, once per question per student | SQL `advance_player` |
| Duplicate / double-click / parallel submits can't double-advance | atomic update + `already_solved` |
| Pause blocks new answers; resume keeps all progress and the question timer | `pause` / `resume` |
| Reconnect recovers progress (credentials kept in the browser) | `/state` + `localStorage` |
| After Q22 → winner screen + final rankings (auto when everyone finishes, or teacher ends) | `Winner` |
| Answers accepted with or without thousands separators (`60795`, `60,795`) | `parseAnswer` |

---

## Setup (≈10 minutes, all free)

### 1. Create the Supabase project
1. Go to <https://supabase.com> → **New project** (free plan). Pick any name/region, set a DB password.
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**.
   Then do the same with [`0002_reveal.sql`](supabase/migrations/0002_reveal.sql) (*Reveal answer*) and
   [`0003_one_attempt.sql`](supabase/migrations/0003_one_attempt.sql) (*one attempt per question*). All are safe to run twice.
3. Open **Project Settings → API** and copy:
   * **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   * **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (**secret**: server only, never share or commit it)

> Realtime needs no extra switches: the game uses *Broadcast*, which is enabled by default.

> **No computer? One-tap alternative.** If you connected Supabase through the Vercel integration, open
> `https://<your-site>/setup` on any device, enter your teacher passcode and tap **Update database**. It runs
> both files above for you (passcode-protected, fixed SQL only, TLS verified against Supabase's root CA).

### 2. Run locally (optional)
```bash
npm install
cp .env.example .env.local      # fill in the 3 Supabase values + TEACHER_PASSCODE
npm run dev                     # http://localhost:3000
```
Without Supabase keys, `npm run dev` falls back to an **in-memory store** (single process, resets on
restart) so you can try the game instantly. This fallback is disabled in production.

### 3. Deploy to Vercel
1. Push this folder to a GitHub repository.
2. At <https://vercel.com/new> import the repository (framework is auto-detected as Next.js).
3. Under **Environment Variables** add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
   | `TEACHER_PASSCODE` | a passcode only you know |

4. Click **Deploy**. Your game is live at `https://<project>.vercel.app`.

Or with the CLI: `npm i -g vercel && vercel` (then add the env vars with `vercel env add`, and `vercel --prod`).

---

## Music, sound effects and "Reveal answer"

* **Music & sound:** synthesized in the browser (no audio files). Calm music in the lobby, faster music
  while racing, plus effects for correct, wrong, race start, new question, pause/resume, reveal and the
  winner fanfare. Everyone has ♪ (music) and 🔊 (effects) buttons in the header. Music starts after the
  first tap (browsers require a tap before playing audio) and is **off by default on the teacher's
  screen**, so it doesn't clash when you share your screen; turn it on with ♪ if you want it.
* **Reveal answer:** the teacher presses **REVEAL ANSWER**. Everyone then sees the full working
  (e.g. `869 × 46 = 39,974`) and that question is closed (no more answers accepted). Opening the next
  question, or re-opening the same one from the selector, hides it again. Before the button is pressed
  the answer is never sent to any browser.

## Running a live online lesson

1. Open `https://<your-site>/teacher` on your own device, enter your passcode and click **Create room**.
2. You get a 4-letter **room code** and a **join link**. Paste the link (or write the code) in your video
   call's chat. Share your screen with the dashboard if you like.
3. Students open the link (or the site → type the code), choose a **nickname** and **car**, and wait. You
   see them appear live.
4. Press **START RACE**. Everyone sees **Question 15**. Students solve on paper, type the answer and
   press **Submit**. A wrong answer ends that student's try: they're shown the correct answer and asked to write it in their math book. A correct answer moves the car.
5. Watch the **Student Answers** table (what each student typed, correct or retry, checkpoints, online/offline).
6. When ready, press **NEXT QUESTION** (or jump with the 15–22 selector). Use **PAUSE** to hold the room
   (answers are blocked) and **RESUME** to continue. Use the leaderboard switch to hide rankings from
   students if you want a "blind" round.
7. After Question 22 (or when you press **END RACE**) everyone gets the podium, confetti and final rankings.
   **RESET & RACE AGAIN** (with a confirmation) clears progress for a new round in the same room.

Tips: keep the teacher tab open on the device that created the room. If you close it, reopen
`/teacher` → **Resume your room** (the teacher key is stored in that browser). A student who refreshes or
loses Wi-Fi reconnects automatically; if they open the site on a *different* device they must join again
with a new nickname.

---

## Free-tier limits & notes

| Service | Free limit (check current plans) | Impact |
|---|---|---|
| Supabase Realtime | ~200 concurrent connections, ~2 M messages/month | A class of 30 uses ~31 connections; each answer = one ping to the room |
| Supabase DB | 500 MB, project pauses after ~1 week of inactivity | Resume the project from the dashboard before a lesson after a long break |
| Vercel Hobby | personal/non-commercial use, generous function quota | ~30 students polling every 4 s ≈ 450 requests/min |

* Rooms are never deleted automatically. To clean up, run the commented `delete from public.rooms …`
  statement at the bottom of the migration (or schedule it with `pg_cron`).
* Max 60 players per room, nicknames 1–16 characters, unique per room.
* The Realtime broadcast carries **no game data**. If it's unavailable the game still works through polling.
* Security notes: no API keys are in client code (only the public `anon` key is, by design, and it can't access
  any table). Students cannot impersonate the teacher (control endpoints require the teacher token), cannot act in
  rooms they didn't join, and cannot see other players' answers.

---

## Tests

```bash
npm test          # 30 unit tests: answer key, parsing, engine rules, and the real SQL migration (PGlite)
npm run build && ALLOW_MEMORY_STORE=1 npm start -- -p 3100   # in one terminal
BASE_URL=http://localhost:3100 npm run e2e                   # browser end-to-end: teacher + 2 students
```

The unit tests check all eight answers against both the assignment and the arithmetic
(e.g. `6,755 × 9 = 60,795`), wrong answers, duplicate/concurrent submissions, stale and skip-ahead
requests, pause/resume, reconnection, teacher/student authorization, ranking and reset. The SQL tests run
the actual migration on an embedded Postgres and exercise `advance_player` / `reset_room` and the RLS setup.

## Project layout

```
app/                      pages + API routes (/api/rooms/...)
components/               Car, Track, Leaderboard, Feedback, Winner, Confetti … (ported from the Figma design)
lib/shared.ts             public questions (no answers), types, constants
lib/server/answers.ts     ★ answer key (server only)
lib/server/game.ts        ★ all game rules
lib/server/*-store.ts     Supabase store (production) and in-memory store (dev/tests)
lib/client/               API client, saved sessions, real-time hook
supabase/migrations/      database schema + atomic functions
tests/  scripts/e2e.mjs   unit/SQL tests and browser end-to-end test
```
