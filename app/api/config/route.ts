import { json } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

export function GET() {
  return json({ passcodeRequired: !!process.env.TEACHER_PASSCODE })
}
