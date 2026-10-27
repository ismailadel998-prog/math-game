import type { Metadata, Viewport } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'

const baloo = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-baloo', display: 'swap' })
const nunito = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-nunito', display: 'swap' })

export const metadata: Metadata = {
  title: 'Multiplication Race',
  description: 'A live Grade 5 multiplication racing game for the classroom.',
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1677ff' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
