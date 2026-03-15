import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { writeFileSync } from 'fs'

const TOKEN_FILE = '/tmp/.bible_auth_token'

// POST /api/write-token
// Called after passage completion — writes sudo token to temp file
// PAM module polls this file
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
