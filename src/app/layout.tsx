import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  adjustFontFallback: false,
  display: 'swap',
})

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-noto-sans-thai',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Yangyuen Data Analysis',
  description: 'Blockchain data analysis platform for the Yangyuen loyalty ecosystem',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansThai.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
