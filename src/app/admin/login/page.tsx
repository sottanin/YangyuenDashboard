import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ThemeProvider } from '@/components/ThemeProvider'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'
import { LoginForm } from './LoginForm'

export default async function AdminLoginPage() {
  const cookieStore = await cookies()
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (session) redirect('/dashboard')

  return (
    <ThemeProvider>
      <div className="min-h-screen relative overflow-hidden">
        <div className="grid-bg" />
        <div className="ambient-bg" />
        <main className="relative z-10 min-h-screen grid place-items-center p-6">
          <div className="w-full max-w-md glass-strong rounded-2xl p-6 shadow-lg">
            <div className="mb-6">
              <div className="mb-4">
                <img src="/logo-fullcolor.svg" alt="Yangyuen" className="h-10 w-auto" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-default">Yangyuen Data Analysis</h1>
              <p className="text-sm text-muted mt-1">Sign in to access the analytics dashboard.</p>
            </div>

            <LoginForm />
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
