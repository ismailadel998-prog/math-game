import { getState } from '@/lib/server/game'
import { getStore } from '@/lib/server'
import { credsFrom, handleError, json } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    return json(await getState(getStore(), code, credsFrom(req), Date.now()))
  } catch (e) {
    return handleError(e)
  }
}
