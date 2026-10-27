import 'server-only'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

/**
 * Applies every supabase/migrations/*.sql file in name order. All files are idempotent, so re-running is safe.
 * The connection is TLS-verified against Supabase's published root CA (supabase/ca/), plus an optional
 * extra PEM from SUPABASE_CA_CERT. Certificate verification is never disabled.
 */
export async function runMigrations(connectionString: string): Promise<string[]> {
  const root = process.cwd()
  const dir = path.join(root, 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  if (files.length === 0) throw new Error('No migration files found')

  const url = new URL(connectionString)
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) // embedded test database only
  url.searchParams.delete('sslmode') // we pass explicit, verifying TLS options below
  const ca = [readFileSync(path.join(root, 'supabase', 'ca', 'supabase-root-2021-ca.pem'), 'utf8')]
  if (process.env.SUPABASE_CA_CERT) ca.push(process.env.SUPABASE_CA_CERT)

  const client = new Client({
    connectionString: url.toString(),
    ssl: local ? false : { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
  })
  await client.connect()
  const applied: string[] = []
  try {
    for (const f of files) {
      await client.query(readFileSync(path.join(dir, f), 'utf8'))
      applied.push(f)
    }
  } finally {
    await client.end().catch(() => {})
  }
  return applied
}
