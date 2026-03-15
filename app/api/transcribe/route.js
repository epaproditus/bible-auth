import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export const runtime = 'nodejs'

function getErrorMessage(status, body) {
  if (body && typeof body === 'object') {
    if (body.error?.message) return body.error.message
    if (body.message) return body.message
  }
  if (status === 401) return 'OpenAI API key is invalid'
  if (status === 429) return 'OpenAI rate limit reached'
  return 'Transcription request failed'
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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
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

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1'

  const upstreamForm = new FormData()
  upstreamForm.append('model', model)
  upstreamForm.append('language', 'en')
  upstreamForm.append('temperature', '0')
  upstreamForm.append('file', audio, audio.name || 'speech.webm')

  const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: upstreamForm,
  })

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(
      { error: getErrorMessage(upstream.status, body) },
      { status: 502 },
    )
  }

  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json({ text: typeof data.text === 'string' ? data.text : '' })
}
