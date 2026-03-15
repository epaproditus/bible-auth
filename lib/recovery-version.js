function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function extractFirstString(value, depth = 0) {
  if (depth > 5 || value == null) return ''

  if (typeof value === 'string') {
    return normalizeText(value)
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractFirstString(entry, depth + 1))
      .filter(Boolean)
    return normalizeText(parts.join(' '))
  }

  if (typeof value !== 'object') return ''

  const textKeys = [
    'text',
    'verse',
    'verse_text',
    'verseText',
    'content',
    'scripture',
    'passage',
    'body',
  ]
  for (const key of textKeys) {
    const direct = extractFirstString(value[key], depth + 1)
    if (direct) return direct
  }

  const priorityKeys = ['verses', 'results', 'data', 'items', 'passages']
  for (const key of priorityKeys) {
    const nested = extractFirstString(value[key], depth + 1)
    if (nested) return nested
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (!/verse|text|scripture|content|passage/i.test(key)) continue
    const nested = extractFirstString(nestedValue, depth + 1)
    if (nested) return nested
  }

  for (const nestedValue of Object.values(value)) {
    const nested = extractFirstString(nestedValue, depth + 1)
    if (nested) return nested
  }

  return ''
}

function extractReference(payload, fallbackReference) {
  if (!payload || typeof payload !== 'object') return fallbackReference

  const refKeys = ['ref', 'reference', 'citation', 'verse_ref', 'verseReference']
  for (const key of refKeys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return fallbackReference
}

function isErrorPayload(payload) {
  if (!payload || typeof payload !== 'object') return false
  if (typeof payload.error === 'string' && payload.error.trim()) return true
  if (payload.error && typeof payload.error.message === 'string') return true
  if (typeof payload.message === 'string' && /error|invalid|unauthorized/i.test(payload.message)) return true
  if (typeof payload.status === 'string' && payload.status.toLowerCase() === 'error') return true
  return false
}

function applyTemplate(template, reference, apiKey) {
  const encodedRef = encodeURIComponent(reference)
  const encodedKey = encodeURIComponent(apiKey || '')

  return template
    .replaceAll('{reference}', encodedRef)
    .replaceAll('{ref}', encodedRef)
    .replaceAll('{apiKey}', encodedKey)
}

function buildRequestUrl(reference, apiKey) {
  const configured = process.env.RECOVERY_VERSION_API_TEMPLATE || process.env.RECOVERY_VERSION_API_URL
  if (configured) {
    if (configured.includes('{reference}') || configured.includes('{ref}') || configured.includes('{apiKey}')) {
      return applyTemplate(configured, reference, apiKey)
    }

    try {
      const url = new URL(configured)
      if (!url.searchParams.has('reference') && !url.searchParams.has('ref') && !url.searchParams.has('String')) {
        url.searchParams.set('reference', reference)
      }
      if (
        apiKey &&
        !process.env.RECOVERY_VERSION_API_KEY_HEADER &&
        !url.searchParams.has('apiKey') &&
        !url.searchParams.has('apikey') &&
        !url.searchParams.has('key')
      ) {
        url.searchParams.set('apiKey', apiKey)
      }
      return url.toString()
    } catch {}
  }

  const legacy = new URL('https://api.lsm.org/recver.php')
  legacy.searchParams.set('String', reference)
  legacy.searchParams.set('Out', 'json')
  if (apiKey) legacy.searchParams.set('apiKey', apiKey)
  return legacy.toString()
}

function buildHeaders(apiKey) {
  const headers = { Accept: 'application/json' }

  if (!apiKey) return headers

  const headerName = process.env.RECOVERY_VERSION_API_KEY_HEADER
  if (headerName) {
    headers[headerName] = apiKey
  }

  const authScheme = (process.env.RECOVERY_VERSION_API_AUTH_SCHEME || '').toLowerCase().trim()
  if (authScheme === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

export async function fetchRecoveryVerse(reference) {
  const apiKey = process.env.RECOVERY_VERSION_API_KEY || ''
  const url = buildRequestUrl(reference, apiKey)

  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(8000)
      : undefined

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
      cache: 'no-store',
      signal,
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  const payload = await response.json().catch(() => null)
  if (!payload || isErrorPayload(payload)) return null

  const text = extractFirstString(payload)
  if (!text) return null

  return {
    ref: extractReference(payload, reference),
    text,
  }
}
