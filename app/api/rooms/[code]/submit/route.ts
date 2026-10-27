import { after } from 'next/server'
import { submitAnswer } from '@/lib/server/game'
import { getStore, notifyRoom } from '@/lib/server'
import { normalizeRoomCode } from '@/lib/shared'
import { credsFrom, handleError, json, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const body = await readJson(req)
    const res = await submitAnswer(getStore(), code, credsFrom(req), { questionIndex: body.questionIndex, answer: body.answer }, Date.now())
    if (res.result === 'correct') after(() => notifyRoom(normalizeRoomCode(code)))
    else if (res.result === 'incorrect') after(() => notifyRoom(normalizeRoomCode(code))) // teacher table shows the attempt
    return json(res)
  } catch (e) {
    return handleError(e)
  }
}
