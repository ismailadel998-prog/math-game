import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../lib/server/migrate'

// Runs the real runMigrations() (pg driver, same code path as production) against an embedded Postgres.
describe('one-tap migration runner', () => {
  let db: PGlite, server: PGLiteSocketServer
  const port = 54329
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=require`

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create role service_role; create role anon; create role authenticated;')
    server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
    await server.start()
  })
  afterAll(async () => { await server.stop(); await db.close() })

  it('applies all migrations, and again (idempotent)', async () => {
    expect(await runMigrations(url)).toEqual(['0001_init.sql', '0002_reveal.sql', '0003_one_attempt.sql'])
    expect(await runMigrations(url)).toEqual(['0001_init.sql', '0002_reveal.sql', '0003_one_attempt.sql'])
    const cols = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name='rooms' and column_name='revealed'`)
    expect(cols.rows).toHaveLength(1)
    const rls = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname in ('rooms','players','submissions') and relkind='r'`)
    expect(rls.rows.every((r) => r.relrowsecurity)).toBe(true)
  })
})
