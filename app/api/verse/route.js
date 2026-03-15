import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { fetchRandomRecoveryVerse, fetchRecoveryVerse } from '@/lib/recovery-version'

export const runtime = 'nodejs'

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
  const requestedRef = searchParams.get('ref')?.trim() || ''

  const remoteVerse = requestedRef
    ? await fetchRecoveryVerse(requestedRef)
    : await fetchRandomRecoveryVerse()
  if (remoteVerse) {
    return NextResponse.json({ ...remoteVerse, source: 'recovery-api' })
  }

  return NextResponse.json(
    {
      error: 'Recovery Version API did not return a verse',
      requestedRef: requestedRef || null,
    },
    { status: 502 },
  )
}
