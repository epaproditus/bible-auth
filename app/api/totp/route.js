import { NextResponse } from 'next/server'
import { createGuardrails, generate } from 'otplib'
import { verifyToken } from '@/lib/auth'
import { SERVICES } from '@/lib/services'
import { cookies } from 'next/headers'

function resolveSecret(rawSecret) {
  const trimmed = rawSecret.trim()

  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    try {
      const parsed = new URL(trimmed)
      const secretFromUri = parsed.searchParams.get('secret')
      if (!secretFromUri) return null
      return secretFromUri.replace(/\s+/g, '').toUpperCase()
    } catch {
      return null
    }
  }

  return trimmed.replace(/\s+/g, '').toUpperCase()
}

export async function GET(req) {
  const cookieStore = await cookies()
  const session = cookieStore.get('ba_session')?.value

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await verifyToken(session)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const serviceId = searchParams.get('service')

  const service = SERVICES.find((s) => s.id === serviceId)
  if (!service) {
    return NextResponse.json({ error: 'Unknown service' }, { status: 400 })
  }

  const configuredSecret = process.env[service.envKey]
  if (!configuredSecret) {
    return NextResponse.json({ error: 'Secret not configured' }, { status: 500 })
  }

  const secret = resolveSecret(configuredSecret)
  if (!secret) {
    return NextResponse.json({ error: 'Invalid otpauth URI secret' }, { status: 500 })
  }

  let code
  try {
    const compatibilityGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 })
    code = await generate({ secret, guardrails: compatibilityGuardrails })
  } catch {
    return NextResponse.json({ error: 'Invalid TOTP secret format' }, { status: 500 })
  }
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30)

  return NextResponse.json({ code, remaining })
}
