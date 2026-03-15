import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { writeFileSync } from 'fs'

const TOKEN_FILE = '/tmp/.bible_auth_token'

// POST /api/sudo-token
// No session required — this endpoint is only reachable locally
// Issues a 60s single-use token and writes it to the PAM token file
export async function POST() {
  const token = randomBytes(32).toString('hex')

  try {
    writeFileSync(TOKEN_FILE, token + '\n', { mode: 0o600 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to write token file' }, { status: 500 })
  }
}
