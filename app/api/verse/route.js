import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { fetchRecoveryVerse } from '@/lib/recovery-version'
import { findVerseByRef, pickRandomVerse } from '@/lib/verses'

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

  const seedVerse = findVerseByRef(requestedRef) || pickRandomVerse()
  const referenceToLoad = requestedRef || seedVerse.ref

  const remoteVerse = await fetchRecoveryVerse(referenceToLoad)
  if (remoteVerse) {
    return NextResponse.json({ ...remoteVerse, source: 'recovery-api' })
  }

  return NextResponse.json(
    {
      error: 'Recovery Version API did not return a verse',
      requestedRef: referenceToLoad,
    },
    { status: 502 },
  )
}
