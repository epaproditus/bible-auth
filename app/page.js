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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="imperial-frame w-full max-w-md rounded-2xl p-8">
        <div className="mb-10 text-center">
          <p className="text-xs tracking-[0.32em] text-[#7fd9ffaa] uppercase mb-3">Outer Rim Access</p>
          <h1 className="crawl-title text-2xl font-light">Bible Auth</h1>
          <p className="text-[#f4e7b477] text-xs tracking-[0.22em] uppercase mt-3">Voice-gated TOTP vault</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter command code"
            className="w-full bg-[#020814cc] border border-[#7fd9ff44] rounded px-4 py-3 text-[#d8f4ff] placeholder-[#d8f4ff55] text-sm tracking-[0.14em] uppercase focus:outline-none focus:border-[#7fd9ffcc]"
            autoFocus
          />
          {error && <p className="text-red-300 text-xs tracking-[0.14em] text-center uppercase">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-[#7fd9ff77] text-[#d8f4ff] py-3 text-xs tracking-[0.25em] uppercase hover:bg-[#7fd9ff1c] transition-colors disabled:opacity-30"
          >
            {loading ? 'Syncing...' : 'Unlock vault'}
          </button>
        </form>
      </div>
    </main>
  )
}
