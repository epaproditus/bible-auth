import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { randomBytes } from 'crypto'

// In-memory store: token -> expiry timestamp
// Single-use, 60 second TTL
const pendingTokens = new Map()

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now()
  for (const [token, expiry] of pendingTokens.entries()) {
    if (now > expiry) pendingTokens.delete(token)
  }
}, 5 * 60 * 1000)

function isLocalRequest(req) {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = req.headers.get('host')
  const rawHost = (forwardedHost || host || '').split(',')[0].trim().toLowerCase()
  const hostname = rawHost.split(':')[0]
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

// POST /api/auth-token
// Called by the reading page after passage is completed
// Issues a short-lived one-time token for sudo PAM verification
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

  const token = randomBytes(32).toString('hex')
  const expiry = Date.now() + 60 * 1000 // 60 seconds

  pendingTokens.set(token, expiry)

  return NextResponse.json({ token, expires_in: 60 })
}

export { pendingTokens }
