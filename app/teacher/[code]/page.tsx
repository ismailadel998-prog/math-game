import { normalizeRoomCode } from '@/lib/shared'
import TeacherClient from './TeacherClient'

export default async function TeacherPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <TeacherClient code={normalizeRoomCode(code)} />
}
