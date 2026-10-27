import { after } from 'next/server'
import { joinRoom } from '@/lib/server/game'
import { getStore, notifyRoom } from '@/lib/server'
import { handleError, json, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const body = await readJson(req)
    const res = await joinRoom(getStore(), code, body.nickname, body.car)
    after(() => notifyRoom(res.code))
    return json(res, 201)
  } catch (e) {
    return handleError(e)
  }
}
