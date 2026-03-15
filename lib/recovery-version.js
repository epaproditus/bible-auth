function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function toBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64')
  }
  return btoa(value)
}

function buildLsmUrl(reference) {
  const baseUrl = process.env.RECOVERY_VERSION_BASE_URL || 'https://api.lsm.org/recver'
  const endpoint = process.env.RECOVERY_VERSION_API_URL || `${baseUrl.replace(/\/$/, '')}/txo.php`
  const url = new URL(endpoint)
  url.searchParams.set('String', reference)
  url.searchParams.set('Out', 'json')
  url.searchParams.set('Lang', process.env.RECOVERY_VERSION_LANG || 'eng')

  const inputMode = (process.env.RECOVERY_VERSION_INPUT_MODE || '').trim()
  if (inputMode) {
    url.searchParams.set('In', inputMode)
  }

  return url.toString()
}

function buildAuthHeaders() {
  const headers = { Accept: 'application/json' }

  const appId = process.env.RECOVERY_VERSION_APP_ID || ''
  const token = process.env.RECOVERY_VERSION_TOKEN || ''
  if (appId && token) {
    headers.Authorization = `Basic ${toBase64(`${appId}:${token}`)}`
    return headers
  }

  // Compatibility with earlier generic env shape if used.
  const key = process.env.RECOVERY_VERSION_API_KEY || ''
  const keyHeader = process.env.RECOVERY_VERSION_API_KEY_HEADER || ''
  if (key && keyHeader) {
    headers[keyHeader] = key
  }
  return headers
}

function parseLsmPayload(payload, requestedRef) {
  if (!payload || typeof payload !== 'object') return null

  const verses = Array.isArray(payload.verses) ? payload.verses : []
  const first = verses[0]
  if (!first || typeof first !== 'object') return null

  const ref = normalizeText(first.ref) || requestedRef
  const text = normalizeText(first.text)
  if (!text) return null

  return {
    ref,
    text,
    detected: normalizeText(payload.detected),
    message: normalizeText(payload.message),
    copyright: normalizeText(payload.copyright),
  }
}

export async function fetchRecoveryVerse(reference) {
  const url = buildLsmUrl(reference)

  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(8000)
      : undefined

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildAuthHeaders(),
      cache: 'no-store',
      signal,
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  const payload = await response.json().catch(() => null)
  const verse = parseLsmPayload(payload, reference)
  if (!verse) return null

  // LSM returns diagnostics in "message"; treat any non-empty message as failure.
  if (verse.message) return null
  return verse
}
