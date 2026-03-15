'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { VERSES } from '@/lib/verses'
import { SERVICES } from '@/lib/services'

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function tokenizeSpokenText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function ReadPage() {
  const router = useRouter()
  const params = useSearchParams()
  const serviceId = params.get('service')
  const service = SERVICES.find(s => s.id === serviceId)

  const [verse] = useState(() => VERSES[Math.floor(Math.random() * VERSES.length)])
  const words = verse.text.split(' ')
  const normalizedWords = words.map(normalizeWord)

  const [currentWord, setCurrentWord] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | listening | done | revealed | expired | error | unsupported
  const [code, setCode] = useState(null)
  const [error, setError] = useState('')
  const [heardText, setHeardText] = useState('')
  const [remaining, setRemaining] = useState(30)
  const timerRef = useRef(null)
  const currentWordRef = useRef(0)
  const recognitionRef = useRef(null)
  const shouldRestartRecognitionRef = useRef(false)
  const completedRef = useRef(false)

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      shouldRestartRecognitionRef.current = false
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
    }
  }, [])

  async function fetchCode() {
    clearInterval(timerRef.current)
    setError('')
    try {
      const res = await fetch(`/api/totp?service=${serviceId}`)
      if (res.status === 401) { router.push('/'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.code) {
        setError(data.error || 'Could not retrieve code')
        setPhase('error')
        return
      }
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
      setError('Could not retrieve code')
      setPhase('error')
    }
  }

  function stopListening() {
    shouldRestartRecognitionRef.current = false
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }
  }

  function completePassage() {
    if (completedRef.current) return
    completedRef.current = true
    stopListening()
    setPhase('done')
    fetchCode()
  }

  function advanceFromSpeech(text) {
    const tokens = tokenizeSpokenText(text)
    if (!tokens.length) return

    let nextWord = currentWordRef.current
    for (const token of tokens) {
      if (nextWord >= normalizedWords.length) break
      if (token === normalizedWords[nextWord]) {
        nextWord += 1
      }
    }

    if (nextWord !== currentWordRef.current) {
      currentWordRef.current = nextWord
      setCurrentWord(nextWord)
    }

    if (nextWord >= normalizedWords.length) {
      completePassage()
    }
  }

  function startListening() {
    setError('')
    setHeardText('')
    setCode(null)
    setRemaining(30)
    completedRef.current = false

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setPhase('unsupported')
      return
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = event => {
        const chunk = Array.from(event.results)
          .slice(event.resultIndex)
          .map(result => result[0]?.transcript || '')
          .join(' ')
          .trim()

        if (!chunk) return
        setHeardText(chunk)
        advanceFromSpeech(chunk)
      }

      recognition.onerror = event => {
        const message =
          event.error === 'not-allowed'
            ? 'Mic access is blocked. Allow microphone permission and try again.'
            : event.error === 'audio-capture'
              ? 'No microphone was found.'
              : event.error === 'no-speech'
                ? 'No speech was detected. Keep the mic close and try again.'
                : 'Speech recognition failed. Try again.'
        setError(message)
        setPhase('error')
        shouldRestartRecognitionRef.current = false
      }

      recognition.onend = () => {
        if (shouldRestartRecognitionRef.current && !completedRef.current) {
          setTimeout(() => {
            if (!shouldRestartRecognitionRef.current || completedRef.current) return
            try {
              recognition.start()
            } catch {}
          }, 150)
        }
      }

      recognitionRef.current = recognition
    }

    currentWordRef.current = 0
    setCurrentWord(0)
    shouldRestartRecognitionRef.current = true
    setPhase('listening')
    try {
      recognitionRef.current.start()
    } catch {}
  }

  function reset() {
    clearInterval(timerRef.current)
    stopListening()
    currentWordRef.current = 0
    completedRef.current = false
    setCurrentWord(0)
    setCode(null)
    setError('')
    setHeardText('')
    setRemaining(30)
    setPhase('idle')
  }

  if (!service) return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-[#c8a84b44] text-xs tracking-widest">Unknown service</p>
    </main>
  )

  const progress = Math.round((currentWord / words.length) * 100)

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-[#f4e7b4]">
      <div className="w-full max-w-3xl rounded-2xl border border-[#f4e7b433] bg-[#02050acc] backdrop-blur-xl p-6 md:p-8 shadow-[0_0_40px_#5cc8ff22]">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.push('/vault')}
            className="text-[#7fd9ff99] hover:text-[#b7ecff] text-xs tracking-[0.2em] uppercase transition-colors"
          >
            Return to hangar
          </button>
          <div className="text-right">
            <p className="text-[#f4e7b4] text-xs tracking-[0.2em] uppercase">Channel: {service.name}</p>
            <p className="text-[#f4e7b488] text-xs tracking-wider mt-1">{verse.ref}</p>
          </div>
        </div>

        {/* Passage */}
        <div className="mb-8 leading-10 select-none rounded-xl border border-[#f4e7b422] bg-[#0a0f17b3] p-4 md:p-6">
          {words.map((word, i) => (
            <span
              key={i}
              className={[
                'inline-block mr-[6px] mb-[6px] px-1 rounded text-xl md:text-2xl transition-all duration-150 tracking-wide',
                i < currentWord ? 'text-[#8ce3ff]' : '',
                i === currentWord && phase === 'listening' ? 'bg-[#ffd86b] text-[#09111d] shadow-[0_0_14px_#ffd86baa]' : '',
                i > currentWord ? 'text-[#3f4c66]' : '',
              ].join(' ')}
            >
              {word}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded bg-[#1a2436] mb-8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#5cc8ff] via-[#ffd86b] to-[#5cc8ff] transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Idle */}
        {phase === 'idle' && (
          <div className="text-center">
            <button
              onClick={startListening}
              className="border border-[#7fd9ff88] text-[#d8f4ff] px-10 py-3 text-xs tracking-[0.25em] uppercase hover:bg-[#7fd9ff1a] transition-colors"
            >
              Start voice gate
            </button>
            <p className="text-[#f4e7b477] text-xs tracking-wider mt-4">
              Speak each word in order to advance the highlight
            </p>
          </div>
        )}

        {phase === 'listening' && (
          <div className="text-center">
            <p className="text-[#7fd9ffcc] text-xs tracking-[0.25em] uppercase animate-pulse">
              Listening...
            </p>
            <p className="text-[#f4e7b488] text-xs tracking-[0.2em] uppercase mt-3">
              {currentWord < words.length
                ? `${words.length - currentWord} words remaining`
                : 'Complete'}
            </p>
            <p className="text-[#f4e7b455] text-xs tracking-wider mt-2">
              Heard: {heardText || '...'}
            </p>
            <button
              onClick={reset}
              className="mt-5 text-xs tracking-[0.2em] uppercase text-[#f4e7b488] hover:text-[#f4e7b4] transition-colors"
            >
              Abort run
            </button>
          </div>
        )}

        {/* Fetching */}
        {phase === 'done' && (
          <div className="text-center text-[#7fd9ffcc] text-xs tracking-widest uppercase animate-pulse">
            Retrieving code...
          </div>
        )}

        {/* Revealed */}
        {phase === 'revealed' && code && (
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] text-[#7fd9ff88] uppercase mb-3">
              {service.name} · one-time code
            </p>
            <div className="text-5xl font-light tracking-[0.4em] text-[#ffd86b] mb-5 font-mono">
              {code}
            </div>
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-32 h-1 rounded bg-[#18263a] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#5cc8ff] to-[#ffd86b] transition-all duration-1000"
                  style={{ width: `${(remaining / 30) * 100}%` }}
                />
              </div>
              <span className="text-[#f4e7b499] text-xs font-mono">{remaining}s</span>
            </div>
            <button
              onClick={() => router.push('/vault')}
              className="text-xs tracking-[0.2em] text-[#f4e7b466] hover:text-[#f4e7b4] uppercase transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Expired */}
        {phase === 'expired' && (
          <div className="text-center">
            <p className="text-[#f4e7b488] text-xs tracking-widest uppercase mb-4">Code expired</p>
            <button
              onClick={reset}
              className="border border-[#7fd9ff66] text-[#d8f4ff] px-8 py-2 text-xs tracking-[0.2em] uppercase hover:bg-[#7fd9ff1a] transition-colors"
            >
              Run passage again
            </button>
          </div>
        )}

        {phase === 'unsupported' && (
          <div className="text-center">
            <p className="text-red-300 text-xs tracking-widest uppercase mb-4">
              This browser does not support speech recognition
            </p>
            <button
              onClick={() => router.push('/vault')}
              className="text-xs tracking-[0.2em] uppercase text-[#f4e7b488] hover:text-[#f4e7b4]"
            >
              Back to services
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center">
            <p className="text-red-300 text-xs tracking-widest uppercase mb-4">
              {error || 'Could not retrieve code'}
            </p>
            <button
              onClick={startListening}
              className="border border-[#7fd9ff66] text-[#d8f4ff] px-8 py-2 text-xs tracking-[0.2em] uppercase hover:bg-[#7fd9ff1a] transition-colors"
            >
              Retry voice gate
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
