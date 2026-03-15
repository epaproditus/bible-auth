import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { writeFileSync } from 'fs'

const TOKEN_FILE = '/tmp/.bible_auth_token'

function isLocalRequest(req) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = req.headers.get('host')
  const rawHost = (forwardedHost || host || '').split(',')[0].trim().toLowerCase()
  const hostname = rawHost.split(':')[0]
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

// POST /api/write-token
// Called after passage completion — writes sudo token to temp file
// PAM module polls this file
export async function POST(req) {
  const cookieStore = await cookies()
  const session = cookieStore.get('ba_session')?.value

  let authorized = false
  if (session) {
    const payload = await verifyToken(session)
    if (payload) authorized = true
  }
  if (!authorized && isLocalRequest(req)) {
    authorized = true
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { token } = await req.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  try {
    writeFileSync(TOKEN_FILE, token + '\n', { mode: 0o600 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to write token file' }, { status: 500 })
  }
}
