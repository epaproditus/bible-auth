'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { VERSES } from '@/lib/verses'
import { SERVICES } from '@/lib/services'

function ReadPage() {
  const router = useRouter()
  const params = useSearchParams()
  const serviceId = params.get('service')
  const service = SERVICES.find(s => s.id === serviceId)

  const [verse] = useState(() => VERSES[Math.floor(Math.random() * VERSES.length)])
  const words = verse.text.split(' ')

  const [currentWord, setCurrentWord] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | reading | done | revealed | expired
  const [code, setCode] = useState(null)
  const [remaining, setRemaining] = useState(30)
  const timerRef = useRef(null)
  const currentWordRef = useRef(0)

  function advance() {
    const next = currentWordRef.current + 1
    currentWordRef.current = next
    setCurrentWord(next)
    if (next >= words.length) {
      setPhase('done')
      fetchCode()
    }
  }

  function handleKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault()
      advance()
    }
  }

  useEffect(() => {
    if (phase === 'reading') {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [phase])

  useEffect(() => () => clearInterval(timerRef.current), [])

  async function fetchCode() {
    try {
      const res = await fetch(`/api/totp?service=${serviceId}`)
      if (res.status === 401) { router.push('/'); return }
      const data = await res.json()
      setCode(data.code)
      setRemaining(data.remaining)
      setPhase('revealed')
      timerRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            clearInterval(timerRef.current)
            setPhase('expired')
            return 0
          }
          return r - 1
        })
      }, 1000)
    } catch {
      setPhase('idle')
    }
  }

  function reset() {
    clearInterval(timerRef.current)
    currentWordRef.current = 0
    setCurrentWord(0)
    setCode(null)
    setPhase('idle')
  }

  if (!service) return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-[#c8a84b44] text-xs tracking-widest">Unknown service</p>
    </main>
  )

  const progress = Math.round((currentWord / words.length) * 100)

  return (
    <main
      className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12"
      onClick={phase === 'reading' ? advance : undefined}
    >
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={e => { e.stopPropagation(); router.push('/vault') }}
            className="text-[#c8a84b33] hover:text-[#c8a84b66] text-xs tracking-widest uppercase transition-colors"
          >
            ← Back
          </button>
          <div className="text-right">
            <p className="text-[#c8a84b] text-xs tracking-[0.2em] uppercase">{service.name}</p>
            <p className="text-[#c8a84b33] text-xs tracking-wider mt-1">{verse.ref}</p>
          </div>
        </div>

        {/* Passage */}
        <div className="mb-8 leading-10 select-none">
          {words.map((word, i) => (
            <span
              key={i}
              className={[
                'inline-block mr-[5px] mb-1 px-1 rounded text-xl transition-all duration-100 font-light tracking-wide',
                i < currentWord  ? 'text-[#c8a84b]' : '',
                i === currentWord && phase === 'reading' ? 'bg-[#c8a84b] text-black' : '',
                i > currentWord  ? 'text-[#2a2a2a]' : '',
              ].join(' ')}
            >
              {word}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full h-px bg-[#111] mb-8">
          <div
            className="h-px bg-[#c8a84b] transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Idle */}
        {phase === 'idle' && (
          <div className="text-center">
            <button
              onClick={() => setPhase('reading')}
              className="border border-[#c8a84b44] text-[#c8a84b] px-10 py-3 text-xs tracking-[0.2em] uppercase hover:bg-[#c8a84b11] transition-colors"
            >
              Begin reading
            </button>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-4">
              Space bar or tap to advance each word
            </p>
          </div>
        )}

        {/* Reading */}
        {phase === 'reading' && (
          <div className="text-center">
            <p className="text-[#c8a84b44] text-xs tracking-[0.2em] uppercase">
              {currentWord < words.length
                ? `${words.length - currentWord} words remaining`
                : 'Complete'}
            </p>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-2">
              Space · tap · or arrow key to advance
            </p>
          </div>
        )}

        {/* Fetching */}
        {phase === 'done' && (
          <div className="text-center text-[#c8a84b44] text-xs tracking-widest uppercase animate-pulse">
            Retrieving code...
          </div>
        )}

        {/* Revealed */}
        {phase === 'revealed' && code && (
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] text-[#c8a84b44] uppercase mb-3">
              {service.name} · one-time code
            </p>
            <div className="text-5xl font-light tracking-[0.4em] text-[#c8a84b] mb-5 font-mono">
              {code}
            </div>
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-28 h-px bg-[#1a1a1a]">
                <div
                  className="h-px bg-[#c8a84b66] transition-all duration-1000"
                  style={{ width: `${(remaining / 30) * 100}%` }}
                />
              </div>
              <span className="text-[#c8a84b33] text-xs font-mono">{remaining}s</span>
            </div>
            <button
              onClick={() => router.push('/vault')}
              className="text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b66] uppercase transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Expired */}
        {phase === 'expired' && (
          <div className="text-center">
            <p className="text-[#c8a84b33] text-xs tracking-widest uppercase mb-4">Code expired</p>
            <button
              onClick={reset}
              className="border border-[#c8a84b22] text-[#c8a84b44] px-8 py-2 text-xs tracking-[0.2em] uppercase hover:border-[#c8a84b44] hover:text-[#c8a84b] transition-colors"
            >
              Read again
            </button>
          </div>
        )}

      </div>
    </main>
  )
}

export default function ReadPageWrapper() {
  return <Suspense><ReadPage /></Suspense>
}
