import { NextResponse } from 'next/server'
import { pendingTokens } from '../auth-token/route'

// GET /api/verify-token?token=<hex>
// Called by the PAM script on the Mac
// Single-use — token is deleted immediately after first successful verify
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Missing token' }, { status: 400 })
  }

  const expiry = pendingTokens.get(token)

  if (!expiry) {
    return NextResponse.json({ valid: false, error: 'Token not found' }, { status: 401 })
  }

  if (Date.now() > expiry) {
    pendingTokens.delete(token)
    return NextResponse.json({ valid: false, error: 'Token expired' }, { status: 401 })
  }

  // Single use — delete immediately
  pendingTokens.delete(token)

  return NextResponse.json({ valid: true })
}
