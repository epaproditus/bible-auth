import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export const runtime = 'nodejs'

function getErrorMessage(status, body, provider) {
  if (body && typeof body === 'object') {
    if (body.error?.message) return body.error.message
    if (body.message) return body.message
    if (typeof body.detail === 'string') return body.detail
  }
  if (status === 401) {
    if (provider === 'elevenlabs') return 'ELEVENLABS_API_KEY is invalid'
    if (provider === 'openai') return 'OPENAI_API_KEY is invalid'
    return 'Transcription key is invalid'
  }
  if (status === 429) return 'Transcription rate limit reached'
  return 'Transcription request failed'
}

function parseText(body) {
  if (!body || typeof body !== 'object') return ''
  if (typeof body.text === 'string') return body.text
  if (typeof body.transcript === 'string') return body.transcript
  return ''
}

function resolveProvider() {
  const requested = (process.env.TRANSCRIBE_PROVIDER || '').toLowerCase().trim()
  if (requested === 'localai') return 'local'
  if (requested) return requested
  if (process.env.LOCAL_TRANSCRIBE_URL) return 'local'
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'none'
}

async function sendToOpenAI(audio) {
  const url = process.env.OPENAI_TRANSCRIBE_URL || 'https://api.openai.com/v1/audio/transcriptions'
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1'

  const form = new FormData()
  form.append('model', model)
  form.append('language', 'en')
  form.append('temperature', '0')
  form.append('file', audio, audio.name || 'speech.webm')

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  })
}

async function sendToElevenLabs(audio) {
  const url = process.env.ELEVENLABS_TRANSCRIBE_URL || 'https://api.elevenlabs.io/v1/speech-to-text'
  const model = process.env.ELEVENLABS_TRANSCRIBE_MODEL || 'scribe_v2'

  const form = new FormData()
  form.append('model_id', model)
  form.append('file', audio, audio.name || 'speech.webm')

  return fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    },
    body: form,
  })
}

async function sendToLocal(audio) {
  const url = process.env.LOCAL_TRANSCRIBE_URL
  const model = process.env.LOCAL_TRANSCRIBE_MODEL || 'whisper-1'

  const form = new FormData()
  form.append('model', model)
  form.append('language', 'en')
  form.append('temperature', '0')
  form.append('file', audio, audio.name || 'speech.webm')

  const headers = {}
  if (process.env.LOCAL_TRANSCRIBE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.LOCAL_TRANSCRIBE_API_KEY}`
  }

  return fetch(url, {
    method: 'POST',
    headers,
    body: form,
  })
}

export async function POST(req) {
  const cookieStore = await cookies()
  const session = cookieStore.get('ba_session')?.value

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await verifyToken(session)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const audio = form.get('audio')

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'Missing audio upload' }, { status: 400 })
  }

  if (audio.size <= 0) {
    return NextResponse.json({ error: 'Audio upload is empty' }, { status: 400 })
  }

  const maxBytes = 25 * 1024 * 1024
  if (audio.size > maxBytes) {
    return NextResponse.json({ error: 'Audio file too large (max 25MB)' }, { status: 413 })
  }

  const provider = resolveProvider()
  if (provider === 'none') {
    return NextResponse.json(
      {
        error:
          'No transcription provider configured. Set TRANSCRIBE_PROVIDER to local, elevenlabs, or openai and add matching env vars.',
      },
      { status: 500 },
    )
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
  }
  if (provider === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured' }, { status: 500 })
  }
  if (provider === 'local' && !process.env.LOCAL_TRANSCRIBE_URL) {
    return NextResponse.json({ error: 'LOCAL_TRANSCRIBE_URL is not configured' }, { status: 500 })
  }

  let upstream
  if (provider === 'openai') upstream = await sendToOpenAI(audio)
  else if (provider === 'elevenlabs') upstream = await sendToElevenLabs(audio)
  else if (provider === 'local') upstream = await sendToLocal(audio)
  else {
    return NextResponse.json(
      { error: `Unsupported TRANSCRIBE_PROVIDER: ${provider}` },
      { status: 500 },
    )
  }

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(
      { error: getErrorMessage(upstream.status, body, provider) },
      { status: 502 },
    )
  }

  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json({ text: parseText(data) })
}
