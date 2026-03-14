import { NextResponse } from 'next/server'
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib'
import { verifyToken } from '@/lib/auth'
import { SERVICES } from '@/lib/services'
import { cookies } from 'next/headers'

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

  const secret = process.env[service.envKey]
  if (!secret) {
    return NextResponse.json({ error: 'Secret not configured' }, { status: 500 })
  }

  const totp = new TOTP()
  totp.use(new NobleCryptoPlugin(), new ScureBase32Plugin())
  const code = totp.generate(secret)
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30)

  return NextResponse.json({ code, remaining })
}
