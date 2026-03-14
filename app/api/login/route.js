import { NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'

export async function POST(req) {
  const { password } = await req.json()

  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = await signToken({ authed: true })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ba_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    path: '/',
  })
  return res
}
