const STORAGE_KEY = 'ba_custom_services_blob_v1'
const SESSION_KEY = 'ba_custom_services_unlocked_v1'
const ITERATIONS = 210000

function bytesToBase64(bytes) {
  let binary = ''
  for (const value of bytes) binary += String.fromCharCode(value)
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(passphrase, salt) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function hasEncryptedCustomVault() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

export async function unlockCustomVault(passphrase) {
  const encrypted = localStorage.getItem(STORAGE_KEY)
  if (!encrypted) return []

  const parsed = JSON.parse(encrypted)
  if (!parsed?.salt || !parsed?.iv || !parsed?.ciphertext) {
    throw new Error('Encrypted vault payload is invalid')
  }

  const salt = base64ToBytes(parsed.salt)
  const iv = base64ToBytes(parsed.iv)
  const ciphertext = base64ToBytes(parsed.ciphertext)
  const key = await deriveKey(passphrase, salt)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )

  const text = new TextDecoder().decode(decrypted)
  const value = JSON.parse(text)
  if (!Array.isArray(value)) throw new Error('Decrypted vault is invalid')
  return value
}

export async function saveCustomVault(services, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)

  const serialized = new TextEncoder().encode(JSON.stringify(services))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    serialized,
  )

  const payload = {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function setUnlockedSessionServices(services) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(services))
  } catch {}
}

export function getUnlockedSessionServices() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
