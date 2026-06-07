import { useState } from 'react'

export function AdminLogin({
  onLogin,
  onBack,
}: {
  onLogin: (username: string, password: string) => Promise<void>
  onBack: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      await onLogin(username, password)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Login failed.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-3xl border border-white/10 bg-panel/90 p-8 shadow-panel">
        <p className="text-xs uppercase tracking-[0.22em] text-blue-100/60">Admin Portal</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Sign In</h1>
        <p className="mt-2 text-sm text-blue-100/75">Manage all rescue cases and protocol documents.</p>

        <div className="mt-6 space-y-3">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-sm text-white placeholder:text-blue-100/40"
          />
          <input
            value={password}
            type="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-sm text-white placeholder:text-blue-100/40"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            void submit()
          }}
          disabled={isSubmitting}
          className="mt-4 w-full rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        >
          {isSubmitting ? 'Signing in...' : 'Login'}
        </button>

        {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full rounded-xl border border-white/20 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Back to Caller Mode
        </button>
      </section>
    </main>
  )
}
