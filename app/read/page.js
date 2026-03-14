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

  const [currentWord, setCurrentWord] = useState(-1)
  const [phase, setPhase] = useState('idle') // idle | listening | done | revealed
  const [code, setCode] = useState(null)
  const [remaining, setRemaining] = useState(30)
  const [error, setError] = useState('')

  const recognitionRef = useRef(null)
  const timerRef = useRef(null)
  const spokenRef = useRef('')

  function startListening() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser. Use Chrome or Safari.')
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    recognitionRef.current = rec
    spokenRef.current = ''
    setPhase('listening')
    setCurrentWord(0)

    rec.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      spokenRef.current = transcript.toLowerCase().trim()
      const spokenWords = spokenRef.current.split(/\s+/)
      let matched = 0
      for (let i = 0; i < words.length; i++) {
        const clean = words[i].replace(/[^a-zA-Z]/g, '').toLowerCase()
        if (spokenWords[i] && spokenWords[i].replace(/[^a-zA-Z]/g, '') === clean) {
          matched = i + 1
        } else break
      }
      setCurrentWord(matched)
      if (matched >= words.length) {
        rec.stop()
        setPhase('done')
        fetchCode()
      }
    }

    rec.onerror = (e) => {
      if (e.error !== 'no-speech') {
        setError('Microphone error: ' + e.error)
        setPhase('idle')
      }
    }
    rec.start()
  }

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
            setCode(null)
            setPhase('expired')
            return 0
          }
          return r - 1
        })
      }, 1000)
    } catch {
      setError('Failed to retrieve code.')
      setPhase('idle')
    }
  }

  useEffect(() => () => {
    recognitionRef.current?.stop()
    clearInterval(timerRef.current)
  }, [])

  if (!service) return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-[#c8a84b44] text-xs tracking-widest">Unknown service</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <button onClick={() => router.push('/vault')} className="text-[#c8a84b33] hover:text-[#c8a84b66] text-xs tracking-widest uppercase transition-colors">← Back</button>
          <div className="text-right">
            <p className="text-[#c8a84b] text-xs tracking-[0.2em] uppercase">{service.name}</p>
            <p className="text-[#c8a84b33] text-xs tracking-wider">{verse.ref}</p>
          </div>
        </div>

        {/* Passage */}
        <div className="mb-10 leading-9">
          {words.map((word, i) => (
            <span key={i} className={`inline-block mr-[6px] mb-1 px-1 rounded text-lg transition-all duration-150 font-light tracking-wide
              ${i < currentWord ? 'text-[#c8a84b]' : ''}
              ${i === currentWord ? 'bg-[#c8a84b] text-black' : ''}
              ${i > currentWord ? 'text-[#333]' : ''}
            `}>{word}</span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full h-px bg-[#111] mb-8">
          <div className="h-px bg-[#c8a84b] transition-all duration-300"
            style={{ width: `${Math.round((currentWord / words.length) * 100)}%` }} />
        </div>

        {/* Controls / Result */}
        {phase === 'idle' && (
          <div className="text-center">
            {error && <p className="text-red-400 text-xs tracking-wider mb-4">{error}</p>}
            <button onClick={startListening}
              className="border border-[#c8a84b44] text-[#c8a84b] px-10 py-3 text-xs tracking-[0.2em] uppercase hover:bg-[#c8a84b11] transition-colors">
              Begin reading
            </button>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-4">Read the passage aloud clearly</p>
          </div>
        )}

        {phase === 'listening' && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[#c8a84b66] text-xs tracking-[0.2em] uppercase">
              <span className="inline-block w-2 h-2 rounded-full bg-[#c8a84b] animate-pulse" />
              Listening
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center text-[#c8a84b44] text-xs tracking-widest uppercase animate-pulse">
            Retrieving code...
          </div>
        )}

        {phase === 'revealed' && code && (
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] text-[#c8a84b44] uppercase mb-3">{service.name} · one-time code</p>
            <div className="text-5xl font-light tracking-[0.4em] text-[#c8a84b] mb-4 font-mono">{code}</div>
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-24 h-px bg-[#111]">
                <div className="h-px bg-[#c8a84b44] transition-all duration-1000"
                  style={{ width: `${(remaining / 30) * 100}%` }} />
              </div>
              <span className="text-[#c8a84b33] text-xs font-mono">{remaining}s</span>
            </div>
            <button onClick={() => router.push('/vault')}
              className="text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b66] uppercase transition-colors">
              Done
            </button>
          </div>
        )}

        {phase === 'expired' && (
          <div className="text-center">
            <p className="text-[#c8a84b44] text-xs tracking-widest uppercase mb-4">Code expired</p>
            <button onClick={() => { setPhase('idle'); setCurrentWord(-1) }}
              className="border border-[#c8a84b22] text-[#c8a84b44] px-8 py-2 text-xs tracking-[0.2em] uppercase hover:border-[#c8a84b44] hover:text-[#c8a84b] transition-colors">
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
