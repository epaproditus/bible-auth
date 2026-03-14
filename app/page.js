'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/vault')
    } else {
      setError('Incorrect password')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <p className="text-xs tracking-[0.3em] text-[#c8a84b66] uppercase mb-3">Authenticator</p>
          <h1 className="text-2xl font-light text-[#c8a84b] tracking-widest">Bible Auth</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Vault password"
            className="w-full bg-transparent border border-[#c8a84b22] rounded px-4 py-3 text-[#c8a84b] placeholder-[#c8a84b33] text-sm tracking-wider focus:outline-none focus:border-[#c8a84b66]"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs tracking-wider text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-[#c8a84b44] text-[#c8a84b] py-3 text-xs tracking-[0.2em] uppercase hover:bg-[#c8a84b11] transition-colors disabled:opacity-30"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>
      </div>
    </main>
  )
}
