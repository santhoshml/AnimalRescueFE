import { useMemo, useState } from 'react'
import { createCase } from './lib/api'
import { AdminConsole } from './screens/AdminConsole'
import { AdminLogin } from './screens/AdminLogin'
import { LandingPage } from './screens/LandingPage'
import type { CaseFormInput, CaseRecord } from './types/rescue'

type Mode = 'caller' | 'admin'

function upsertCase(cases: CaseRecord[], next: CaseRecord): CaseRecord[] {
  const filtered = cases.filter((item) => item.id !== next.id)
  return [next, ...filtered]
}

function App() {
  const [mode, setMode] = useState<Mode>('caller')
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [activeCase, setActiveCase] = useState<CaseRecord | null>(null)
  const [recentCases, setRecentCases] = useState<CaseRecord[]>([])

  const startSession = async (payload: CaseFormInput) => {
    const created = await createCase(payload)
    setActiveCase(created)
    setRecentCases((current) => upsertCase(current, created))
  }

  const handleAdminLogin = async (username: string, password: string) => {
    if (username === 'admin' && password === 'admin') {
      setIsAdminAuthenticated(true)
      return
    }

    throw new Error('Invalid credentials. Use admin/admin for this MVP.')
  }

  const seededCases = useMemo(() => {
    if (activeCase) {
      return upsertCase(recentCases, activeCase)
    }

    return recentCases
  }, [activeCase, recentCases])

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:px-6">
        <div className="inline-flex rounded-xl border border-white/15 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setMode('caller')}
            className={`rounded-lg px-4 py-2 text-sm transition ${
              mode === 'caller' ? 'bg-accent text-white' : 'text-blue-100/80 hover:bg-white/10'
            }`}
          >
            User
          </button>
          <button
            type="button"
            onClick={() => setMode('admin')}
            className={`rounded-lg px-4 py-2 text-sm transition ${
              mode === 'admin' ? 'bg-accent text-white' : 'text-blue-100/80 hover:bg-white/10'
            }`}
          >
            Admin
          </button>
        </div>
      </div>

      {mode === 'admin' ? (
        isAdminAuthenticated ? (
          <AdminConsole
            seededCases={seededCases}
            onLogout={() => {
              setIsAdminAuthenticated(false)
              setMode('caller')
            }}
          />
        ) : (
          <AdminLogin
            onLogin={handleAdminLogin}
            onBack={() => {
              setMode('caller')
            }}
          />
        )
      ) : (
        <LandingPage
          onStart={startSession}
          activeCase={activeCase}
          onResetCase={() => {
            setActiveCase(null)
          }}
        />
      )}
    </main>
  )
}

export default App
