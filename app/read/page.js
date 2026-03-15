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
  const [animationSeed, setAnimationSeed] = useState(0)

  const timerRef = useRef(null)
  const currentWordRef = useRef(0)
  const recognitionRef = useRef(null)
  const keepListeningRef = useRef(false)
  const suppressAbortErrorRef = useRef(false)
  const completedRef = useRef(false)

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      stopListening({ manual: true })
    }
  }, [])

  async function fetchCode() {
    clearInterval(timerRef.current)
    setError('')
    try {
      const res = await fetch(`/api/totp?service=${serviceId}`)
      if (res.status === 401) {
        router.push('/')
        return
      }
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

  function stopListening({ manual = false } = {}) {
    keepListeningRef.current = false
    suppressAbortErrorRef.current = manual
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      try {
        recognition.stop()
      } catch {}
    }
  }

  function handleRecognitionError(errorCode) {
    const message =
      errorCode === 'not-allowed' || errorCode === 'service-not-allowed'
        ? 'Microphone permission denied. Allow access and try again.'
        : errorCode === 'audio-capture'
          ? 'No microphone was found on this device.'
          : errorCode === 'network'
            ? 'Speech recognition network error. Check your connection and retry.'
            : errorCode === 'language-not-supported'
              ? 'Speech recognition language is not supported in this browser.'
              : errorCode === 'start-failed'
                ? 'Could not start speech recognition. Try refreshing and retry.'
                : `Speech recognition error (${errorCode}). Try again.`

    keepListeningRef.current = false
    setError(message)
    setPhase('error')
  }

  function completePassage() {
    if (completedRef.current) return
    completedRef.current = true
    stopListening({ manual: true })
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
    clearInterval(timerRef.current)
    stopListening({ manual: true })
    setError('')
    setHeardText('')
    setCode(null)
    setRemaining(30)
    completedRef.current = false
    currentWordRef.current = 0
    setCurrentWord(0)
    setAnimationSeed(s => s + 1)

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setPhase('unsupported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = event => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim() || ''
        if (!transcript) continue
        if (event.results[i].isFinal) finalChunk += ` ${transcript}`
        else interimChunk += ` ${transcript}`
      }

      const chunk = (finalChunk || interimChunk).trim()
      if (!chunk) return
      setHeardText(chunk)
      advanceFromSpeech(chunk)
    }

    recognition.onerror = event => {
      const errorCode = event.error || 'unknown'
      if (errorCode === 'aborted' && suppressAbortErrorRef.current) return
      if (errorCode === 'no-speech') {
        setHeardText('...')
        return
      }
      handleRecognitionError(errorCode)
    }

    recognition.onend = () => {
      if (!keepListeningRef.current || completedRef.current) return
      suppressAbortErrorRef.current = false
      try {
        recognition.start()
      } catch {
        setTimeout(() => {
          if (!keepListeningRef.current || completedRef.current) return
          try {
            recognition.start()
          } catch {
            handleRecognitionError('start-failed')
          }
        }, 240)
      }
    }

    recognitionRef.current = recognition
    keepListeningRef.current = true
    suppressAbortErrorRef.current = false
    setPhase('listening')

    try {
      recognition.start()
    } catch {
      handleRecognitionError('start-failed')
    }
  }

  function reset() {
    clearInterval(timerRef.current)
    stopListening({ manual: true })
    currentWordRef.current = 0
    completedRef.current = false
    setCurrentWord(0)
    setCode(null)
    setError('')
    setHeardText('')
    setRemaining(30)
    setAnimationSeed(s => s + 1)
    setPhase('idle')
  }

  if (!service) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-[#c8a84b44] text-xs tracking-widest">Unknown service</p>
      </main>
    )
  }

  const progress = Math.round((currentWord / words.length) * 100)

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.push('/vault')}
            className="text-[#c8a84b33] hover:text-[#c8a84b66] text-xs tracking-widest uppercase transition-colors"
          >
            ← Back
          </button>
          <div className="text-right">
            <p className="text-[#c8a84b] text-xs tracking-[0.2em] uppercase">{service.name}</p>
            <p className="text-[#c8a84b33] text-xs tracking-wider mt-1">{verse.ref}</p>
          </div>
        </div>

        <div className="text-center mb-5">
          <p className="text-[#c8a84b55] text-[10px] tracking-[0.38em] uppercase crawl-tag">
            Recitation Sequence
          </p>
        </div>

        <div className="mb-8 leading-10 select-none">
          {words.map((word, i) => (
            <span
              key={`${animationSeed}-${i}`}
              style={{ animationDelay: `${Math.min(i, 26) * 28}ms` }}
              className={[
                'word-in inline-block mr-[5px] mb-1 px-1 rounded text-xl transition-all duration-150 font-light tracking-wide',
                i < currentWord ? 'text-[#c8a84b]' : '',
                i === currentWord && phase === 'listening' ? 'bg-[#c8a84b] text-black' : '',
                i > currentWord ? 'text-[#2a2a2a]' : '',
              ].join(' ')}
            >
              {word}
            </span>
          ))}
        </div>

        <div className="w-full h-px bg-[#111] mb-8">
          <div
            className="h-px bg-[#c8a84b] transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        {phase === 'idle' && (
          <div className="text-center">
            <button
              onClick={startListening}
              className="border border-[#c8a84b44] text-[#c8a84b] px-10 py-3 text-xs tracking-[0.2em] uppercase hover:bg-[#c8a84b11] transition-colors"
            >
              Begin recitation
            </button>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-4">
              Speak each word in order to advance
            </p>
          </div>
        )}

        {phase === 'listening' && (
          <div className="text-center">
            <p className="text-[#c8a84b66] text-xs tracking-[0.22em] uppercase animate-pulse">Listening</p>
            <p className="text-[#c8a84b44] text-xs tracking-[0.2em] uppercase mt-3">
              {currentWord < words.length
                ? `${words.length - currentWord} words remaining`
                : 'Complete'}
            </p>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-2">
              Heard: {heardText || '...'}
            </p>
            <button
              onClick={reset}
              className="mt-5 text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b66] uppercase transition-colors"
            >
              Stop
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center text-[#c8a84b44] text-xs tracking-widest uppercase animate-pulse">
            Retrieving code...
          </div>
        )}

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

        {phase === 'unsupported' && (
          <div className="text-center">
            <p className="text-red-400 text-xs tracking-widest uppercase mb-4">
              Speech recognition is not supported in this browser
            </p>
            <button
              onClick={() => router.push('/vault')}
              className="text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b66] uppercase transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center">
            <p className="text-red-400 text-xs tracking-widest uppercase mb-4">
              {error || 'Could not retrieve code'}
            </p>
            <button
              onClick={startListening}
              className="border border-[#c8a84b22] text-[#c8a84b44] px-8 py-2 text-xs tracking-[0.2em] uppercase hover:border-[#c8a84b44] hover:text-[#c8a84b] transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes crawlTagIn {
          0% { opacity: 0; letter-spacing: 0.55em; transform: translateY(6px); }
          100% { opacity: 1; letter-spacing: 0.38em; transform: translateY(0); }
        }

        @keyframes crawlWordIn {
          0% { opacity: 0; transform: translateY(14px) scale(0.94) skewX(-7deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) skewX(0deg); }
        }

        .crawl-tag {
          opacity: 0;
          animation: crawlTagIn 620ms ease-out forwards;
        }

        .word-in {
          opacity: 0;
          animation: crawlWordIn 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
      `}</style>
    </main>
  )
}

export default function ReadPageWrapper() {
  return <Suspense><ReadPage /></Suspense>
}
