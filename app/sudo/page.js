'use client'
import { useEffect, useRef, useState } from 'react'
import { pickRandomVerse } from '@/lib/verses'

function normalizeWord(w) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '')
}
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}
function pickMime() {
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}
function ext(mime) {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
  return 'webm'
}

export default function SudoPage() {
  const [verse, setVerse] = useState(() => pickRandomVerse())
  const words = verse.text.split(' ')
  const normalized = words.map(normalizeWord)

  const [currentWord, setCurrentWord] = useState(0)
  const [phase, setPhase] = useState('idle') // idle|listening|done|success|error|unsupported
  const [heardText, setHeardText] = useState('')
  const [message, setMessage] = useState('')
  const [animSeed, setAnimSeed] = useState(0)

  const currentWordRef = useRef(0)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const queueRef = useRef([])
  const processingRef = useRef(false)
  const keepGoingRef = useRef(false)
  const doneRef = useRef(false)

  useEffect(() => () => stopListening(), [])

  useEffect(() => {
    let cancelled = false

    async function loadVerse() {
      try {
        const res = await fetch('/api/verse', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (!data.text || !data.ref) return
        if (cancelled || currentWordRef.current > 0 || keepGoingRef.current || doneRef.current) return
        setVerse({ ref: data.ref, text: data.text })
      } catch {}
    }

    void loadVerse()

    return () => {
      cancelled = true
    }
  }, [])

  function stopListening() {
    keepGoingRef.current = false
    chunksRef.current = []
    queueRef.current = []
    const rec = recorderRef.current; recorderRef.current = null
    if (rec && rec.state !== 'inactive') { try { rec.stop() } catch {} }
    const st = streamRef.current; streamRef.current = null
    if (st) st.getTracks().forEach(t => { try { t.stop() } catch {} })
  }

  function advanceFromSpeech(text) {
    const tokens = tokenize(text)
    let next = currentWordRef.current
    for (const token of tokens) {
      if (next >= normalized.length) break
      if (token === normalized[next]) next++
    }
    if (next !== currentWordRef.current) {
      currentWordRef.current = next
      setCurrentWord(next)
    }
    if (next >= normalized.length && !doneRef.current) {
      doneRef.current = true
      stopListening()
      setPhase('done')
      issueToken()
    }
  }

  async function transcribeChunk(blob) {
    const mimeType = blob.type || 'audio/webm'
    const form = new FormData()
    form.append('audio', new File([blob], `chunk.${ext(mimeType)}`, { type: mimeType }))
    const res = await fetch('/api/transcribe', { method: 'POST', body: form })
    if (res.status === 401) throw new Error('Unauthorized')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Transcription failed')
    return typeof data.text === 'string' ? data.text : ''
  }

  async function processQueue() {
    if (processingRef.current) return
    processingRef.current = true
    try {
      while (keepGoingRef.current && queueRef.current.length > 0) {
        const chunk = queueRef.current.shift()
        const text = await transcribeChunk(chunk)
        if (text) { setHeardText(text); advanceFromSpeech(text) }
      }
    } catch (err) {
      if (keepGoingRef.current && !doneRef.current) {
        setMessage(err?.message || 'Transcription failed')
        setPhase('error')
        stopListening()
      }
    } finally { processingRef.current = false }
  }

  async function startListening() {
    stopListening()
    chunksRef.current = []; queueRef.current = []
    processingRef.current = false; doneRef.current = false
    currentWordRef.current = 0
    setCurrentWord(0); setHeardText(''); setMessage('')
    setAnimSeed(s => s + 1)

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setPhase('unsupported'); return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
    } catch {
      setMessage('Microphone permission denied.')
      setPhase('error'); return
    }

    streamRef.current = stream
    const mime = pickMime()
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)

    recorder.ondataavailable = e => {
      if (!e.data || e.data.size <= 0) return
      chunksRef.current.push(e.data)
      const full = new Blob(chunksRef.current, { type: e.data.type || mime || 'audio/webm' })
      queueRef.current.push(full)
      void processQueue()
    }

    recorder.onerror = () => {
      if (!keepGoingRef.current) return
      setMessage('Recording failed'); setPhase('error'); stopListening()
    }

    recorderRef.current = recorder
    keepGoingRef.current = true
    setPhase('listening')
    setHeardText('Listening...')
    try { recorder.start(3000) } catch {
      setMessage('Could not start microphone'); setPhase('error'); stopListening()
    }
  }

  async function issueToken() {
    try {
      const res = await fetch('/api/sudo-token', { method: 'POST' })
      if (!res.ok) throw new Error()
      setPhase('success')
      setMessage('Authenticated. This window will close.')
      setTimeout(() => window.close(), 2000)
    } catch {
      setPhase('error')
      setMessage('Could not write auth token.')
    }
  }

  const progress = Math.round((currentWord / words.length) * 100)

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">

        <div className="mb-6 text-center">
          <p className="text-xs tracking-[0.3em] text-[#c8a84b44] uppercase mb-1">sudo authentication</p>
          <p className="text-[#c8a84b22] text-xs tracking-wider">{verse.ref}</p>
        </div>

        <div className="mb-8 leading-10 select-none">
          {words.map((word, i) => (
            <span key={`${animSeed}-${i}`} className={[
              'inline-block mr-[5px] mb-1 px-1 rounded text-xl font-light tracking-wide transition-all duration-100',
              i < currentWord ? 'text-[#c8a84b]' : '',
              i === currentWord && phase === 'listening' ? 'bg-[#c8a84b] text-black' : '',
              i > currentWord ? 'text-[#2a2a2a]' : '',
            ].join(' ')}>{word}</span>
          ))}
        </div>

        <div className="w-full h-px bg-[#111] mb-8">
          <div className="h-px bg-[#c8a84b] transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>

        {phase === 'idle' && (
          <div className="text-center">
            <button onClick={startListening}
              className="border border-[#c8a84b44] text-[#c8a84b] px-10 py-3 text-xs tracking-[0.2em] uppercase hover:bg-[#c8a84b11] transition-colors">
              Begin reading
            </button>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-3">Read the passage aloud</p>
          </div>
        )}

        {phase === 'listening' && (
          <div className="text-center">
            <p className="text-[#c8a84b66] text-xs tracking-[0.22em] uppercase animate-pulse">Listening</p>
            <p className="text-[#c8a84b22] text-xs tracking-wider mt-2">{heardText}</p>
            <button onClick={() => { stopListening(); setPhase('idle') }}
              className="mt-4 text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b55] uppercase transition-colors">
              Stop
            </button>
          </div>
        )}

        {phase === 'done' && (
          <p className="text-center text-[#c8a84b44] text-xs tracking-widest uppercase animate-pulse">Authenticating...</p>
        )}

        {phase === 'success' && (
          <p className="text-center text-[#c8a84b] text-xs tracking-widest uppercase">{message}</p>
        )}

        {(phase === 'error' || phase === 'unsupported') && (
          <div className="text-center">
            <p className="text-red-400 text-xs tracking-widest uppercase mb-4">
              {phase === 'unsupported' ? 'Microphone not supported in this browser' : message}
            </p>
            <button onClick={startListening}
              className="border border-[#c8a84b22] text-[#c8a84b44] px-8 py-2 text-xs tracking-[0.2em] uppercase hover:border-[#c8a84b44] hover:text-[#c8a84b] transition-colors">
              Try again
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
