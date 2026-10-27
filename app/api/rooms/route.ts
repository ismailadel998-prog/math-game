import { createRoom } from '@/lib/server/game'
import { getStore } from '@/lib/server'
import { handleError, json, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await readJson(req)
    const passcode = typeof body.passcode === 'string' ? body.passcode : null
    return json(await createRoom(getStore(), passcode), 201)
  } catch (e) {
    return handleError(e)
  }
}
