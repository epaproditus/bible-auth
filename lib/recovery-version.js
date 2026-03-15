function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

const BOOK_CACHE_TTL_MS = 12 * 60 * 60 * 1000
let cachedBooks = null
let cachedBooksAt = 0

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

function toTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  return undefined
}

function parseVerses(rawVerses) {
  if (!Array.isArray(rawVerses)) return []
  return rawVerses
    .map((verse) => {
      if (!verse || typeof verse !== 'object') return null
      const text = normalizeText(verse.text)
      if (!text) return null
      return {
        ref: normalizeText(verse.ref),
        text,
        urlpfx: normalizeText(verse.urlpfx),
      }
    })
    .filter(Boolean)
}

function parseLsmPayload(payload, requestedRef) {
  if (!payload || typeof payload !== 'object') return null

  const verses = parseVerses(payload.verses)

  return {
    inputstring: normalizeText(payload.inputstring),
    detected: normalizeText(payload.detected),
    message: normalizeText(payload.message),
    copyright: normalizeText(payload.copyright),
    verses,
    requestedRef,
  }
}

async function fetchRecoveryPayload(reference) {
  const url = buildLsmUrl(reference)

  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildAuthHeaders(),
      cache: 'no-store',
      signal: toTimeoutSignal(8000),
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  const payload = await response.json().catch(() => null)
  return parseLsmPayload(payload, reference)
}

function pickRandomIndex(length) {
  return Math.floor(Math.random() * length)
}

function parseBookRows(html) {
  if (typeof html !== 'string' || !html) return []

  const books = []
  const rowRegex = /<tr[^>]*>\s*<td>(.*?)<\/td>\s*<td>(\d+)<\/td>/gims
  let match
  while ((match = rowRegex.exec(html))) {
    const rawName = normalizeText(match[1].replace(/<[^>]*>/g, ' '))
    const maxChapters = Number.parseInt(match[2], 10)
    if (!rawName || !Number.isFinite(maxChapters) || maxChapters <= 0) continue
    books.push({ name: rawName, maxChapters })
  }

  return books
}

async function fetchBookIndex() {
  const now = Date.now()
  if (cachedBooks && now - cachedBooksAt < BOOK_CACHE_TTL_MS) {
    return cachedBooks
  }

  const docsUrl = process.env.RECOVERY_VERSION_DOCS_URL || 'https://api.lsm.org/recver/txo-docs.htm'
  let response
  try {
    response = await fetch(docsUrl, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      cache: 'no-store',
      signal: toTimeoutSignal(8000),
    })
  } catch {
    return []
  }

  if (!response.ok) return []

  const html = await response.text().catch(() => '')
  const books = parseBookRows(html)
  if (books.length > 0) {
    cachedBooks = books
    cachedBooksAt = now
  }
  return books
}

function createRandomChapterRef(books) {
  const book = books[pickRandomIndex(books.length)]
  const chapter = 1 + pickRandomIndex(book.maxChapters)
  return `${book.name} ${chapter}`
}

export async function fetchRecoveryVerse(reference) {
  const payload = await fetchRecoveryPayload(reference)
  if (!payload || payload.message || payload.verses.length === 0) return null

  const verse = payload.verses[0]
  return {
    ref: verse.ref || payload.detected || reference,
    text: verse.text,
    copyright: payload.copyright,
  }
}

export async function fetchRandomRecoveryVerse() {
  const books = await fetchBookIndex()
  if (books.length === 0) return null

  const maxAttempts = Number.parseInt(process.env.RECOVERY_VERSION_RANDOM_ATTEMPTS || '8', 10)
  const attempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 8

  for (let i = 0; i < attempts; i += 1) {
    const chapterRef = createRandomChapterRef(books)
    const payload = await fetchRecoveryPayload(chapterRef)
    if (!payload || payload.message || payload.verses.length === 0) continue

    const verse = payload.verses[pickRandomIndex(payload.verses.length)]
    if (!verse?.text) continue

    return {
      ref: verse.ref || payload.detected || chapterRef,
      text: verse.text,
      copyright: payload.copyright,
      sourceChapter: chapterRef,
    }
  }

  return null
}
