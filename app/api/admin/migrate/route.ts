import { createHash, timingSafeEqual } from 'node:crypto'
import { runMigrations } from '@/lib/server/migrate'
import { json, readJson, setupHint } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const sha = (s: string) => createHash('sha256').update(s).digest()

/**
 * One-tap database setup/update. Protected by TEACHER_PASSCODE and runs only the fixed,
 * idempotent files in supabase/migrations/. No user-supplied SQL is ever executed.
 */
export async function POST(req: Request) {
  const required = process.env.TEACHER_PASSCODE
  if (!required) return json({ error: 'no_passcode', message: 'Set TEACHER_PASSCODE in Vercel first; it protects this page.' }, 403)
  const body = await readJson(req)
  const given = typeof body.passcode === 'string' ? body.passcode : ''
  await new Promise((r) => setTimeout(r, 600)) // slow down guessing
  if (!timingSafeEqual(sha(given), sha(required))) return json({ error: 'bad_passcode', message: 'Wrong passcode.' }, 401)

  const conn = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  if (!conn) return json({ error: 'no_db', message: 'No database connection found. Connect the Supabase integration to this Vercel project.' }, 500)
  try {
    const applied = await runMigrations(conn)
    return json({ ok: true, applied })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    console.error('migration failed:', raw)
    let message = 'The database rejected the update. Check the Vercel logs for "migration failed".'
    if (/self.signed|certificate|UNABLE_TO_VERIFY|issuer/i.test(raw)) message = 'Could not verify the database certificate. Use the Supabase SQL Editor instead (README, step 1).'
    else if (/ENOTFOUND|ECONN|ETIMEDOUT|timeout/i.test(raw)) message = 'Could not reach the database. Check that the Supabase project is active (not paused).'
    else if (/password authentication|authentication failed/i.test(raw)) message = 'The database rejected the saved credentials. Redeploy so Vercel picks up the latest keys.'
    else { const h = setupHint(e); if (h !== 'Something went wrong on the server.') message = h }
    return json({ error: 'migration_failed', message }, 500)
  }
}
