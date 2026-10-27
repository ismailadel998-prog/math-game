'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Header } from '@/components/ui'
import { HeroCopy, JoinCard } from '@/components/JoinCard'
import { getLast } from '@/lib/client/session'

export default function Home() {
  const router = useRouter()
  const [car, setCar] = useState(0)
  const [last, setLast] = useState<{ role: 'player' | 'teacher'; code: string } | null>(null)
  useEffect(() => { setLast(getLast()) }, [])

  return (
    <div className="page lobby-page">
      <Header right={<Link className="btn btn-ghost btn-link" href="/teacher">Teacher controls</Link>} />
      <main className="lobby-main">
        <HeroCopy car={car} />
        <div>
          <JoinCard car={car} setCar={setCar} onJoined={(code) => router.push(`/play/${code}`)} />
          {last && (
            <div className="rejoin">
              <span>Welcome back! Rejoin room <b>{last.code}</b>?</span>
              <Link className="btn btn-secondary btn-link" href={last.role === 'teacher' ? `/teacher/${last.code}` : `/play/${last.code}`}>Rejoin</Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
