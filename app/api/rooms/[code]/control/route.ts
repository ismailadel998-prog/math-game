import { after } from 'next/server'
import { control } from '@/lib/server/game'
import { getStore, notifyRoom } from '@/lib/server'
import { credsFrom, handleError, json, readJson } from '@/lib/server/http'
import { normalizeRoomCode, type ControlAction } from '@/lib/shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const body = (await readJson(req)) as unknown as ControlAction
    await control(getStore(), code, credsFrom(req), body, Date.now())
    after(() => notifyRoom(normalizeRoomCode(code)))
    return json({ ok: true })
  } catch (e) {
    return handleError(e)
  }
}
