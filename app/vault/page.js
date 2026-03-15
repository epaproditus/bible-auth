'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SERVICES } from '@/lib/services'
import {
  getUnlockedSessionServices,
  hasEncryptedCustomVault,
  saveCustomVault,
  setUnlockedSessionServices,
  unlockCustomVault,
} from '@/lib/custom-vault'

const FAVORITES_KEY = 'ba_favorite_services'
const LAST_USED_KEY = 'ba_last_used_services'

function formatLastUsed(timestamp) {
  if (!timestamp) return 'Never'

  const elapsed = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (elapsed < minute) return 'Just now'
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m ago`
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h ago`
  return `${Math.floor(elapsed / day)}d ago`
}

function makeCustomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `custom-${crypto.randomUUID()}`
  }
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function VaultPage() {
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState([])
  const [lastUsed, setLastUsed] = useState({})
  const [customServices, setCustomServices] = useState([])

  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [hasEncryptedVault, setHasEncryptedVault] = useState(false)
  const [vaultPassphrase, setVaultPassphrase] = useState('')
  const [vaultError, setVaultError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSecret, setNewSecret] = useState('')

  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const savedFavorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
      if (Array.isArray(savedFavorites)) setFavorites(savedFavorites)

      const savedLastUsed = JSON.parse(localStorage.getItem(LAST_USED_KEY) || '{}')
      if (savedLastUsed && typeof savedLastUsed === 'object') setLastUsed(savedLastUsed)

      const encryptedExists = hasEncryptedCustomVault()
      setHasEncryptedVault(encryptedExists)

      const unlockedSession = getUnlockedSessionServices()
      if (unlockedSession.length > 0) {
        setCustomServices(unlockedSession)
        setVaultUnlocked(true)
      } else {
        setVaultUnlocked(false)
      }
    } catch {}

    setHydrated(true)
  }, [])

  function persistFavorites(next) {
    setFavorites(next)
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)) } catch {}
  }

  function persistLastUsed(next) {
    setLastUsed(next)
    try { localStorage.setItem(LAST_USED_KEY, JSON.stringify(next)) } catch {}
  }

  async function unlockOrCreateVault() {
    if (!vaultPassphrase.trim()) {
      setVaultError('Enter passphrase')
      return
    }

    setBusy(true)
    setVaultError('')
    try {
      if (!hasEncryptedVault) {
        await saveCustomVault([], vaultPassphrase)
        setCustomServices([])
        setUnlockedSessionServices([])
        setHasEncryptedVault(true)
        setVaultUnlocked(true)
        return
      }

      const decrypted = await unlockCustomVault(vaultPassphrase)
      setCustomServices(decrypted)
      setUnlockedSessionServices(decrypted)
      setVaultUnlocked(true)
    } catch {
      setVaultError('Passphrase is incorrect')
    } finally {
      setBusy(false)
    }
  }

  async function persistCustomServices(next) {
    if (!vaultPassphrase.trim()) {
      setVaultError('Enter passphrase to save changes')
      return false
    }

    setBusy(true)
    setVaultError('')
    try {
      await saveCustomVault(next, vaultPassphrase)
      setCustomServices(next)
      setUnlockedSessionServices(next)
      return true
    } catch {
      setVaultError('Could not save custom services')
      return false
    } finally {
      setBusy(false)
    }
  }

  function toggleFavorite(serviceId) {
    const isFavorite = favorites.includes(serviceId)
    const next = isFavorite
      ? favorites.filter((id) => id !== serviceId)
      : [...favorites, serviceId]
    persistFavorites(next)
  }

  function beginRecitation(service) {
    const next = { ...lastUsed, [service.id]: Date.now() }
    persistLastUsed(next)

    const target = service.source === 'custom'
      ? `/read?service=${service.id}&source=custom`
      : `/read?service=${service.id}`

    router.push(target)
  }

  async function addCustomService(e) {
    e.preventDefault()

    const name = newName.trim()
    const secret = newSecret.trim()
    if (!name || !secret) {
      setVaultError('Name and secret are required')
      return
    }

    const custom = {
      id: makeCustomId(),
      name,
      description: newDescription.trim() || 'Custom service',
      secret,
      source: 'custom',
    }

    const next = [...customServices, custom]
    const saved = await persistCustomServices(next)
    if (!saved) return

    setNewName('')
    setNewDescription('')
    setNewSecret('')
    setShowAdd(false)
  }

  async function deleteCustomService(serviceId) {
    const next = customServices.filter((service) => service.id !== serviceId)
    const saved = await persistCustomServices(next)
    if (!saved) return

    const nextFavorites = favorites.filter((id) => id !== serviceId)
    persistFavorites(nextFavorites)
  }

  const visibleServices = useMemo(() => {
    const lowered = query.trim().toLowerCase()

    const custom = customServices.map((service) => ({ ...service, source: 'custom' }))
    const env = SERVICES.map((service) => ({ ...service, source: 'env' }))
    const pool = [...env, ...custom]

    const filtered = pool.filter((service) => {
      if (!lowered) return true
      return (
        service.name.toLowerCase().includes(lowered) ||
        service.description.toLowerCase().includes(lowered) ||
        service.id.toLowerCase().includes(lowered)
      )
    })

    return filtered
      .map((service) => ({
        ...service,
        pinned: favorites.includes(service.id),
        seenAt: lastUsed[service.id] || 0,
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.seenAt !== b.seenAt) return b.seenAt - a.seenAt
        return a.name.localeCompare(b.name)
      })
  }, [customServices, favorites, lastUsed, query])

  const favoriteCount = favorites.length
  const seenCount = Object.values(lastUsed).filter(Boolean).length

  return (
    <main className="min-h-screen bg-black px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#c8a84b44] uppercase mb-1">Vault</p>
            <h1 className="text-2xl font-light text-[#c8a84b] tracking-widest">Authenticator services</h1>
            <p className="text-xs text-[#c8a84b33] mt-2 tracking-wider">
              Recite the passage to reveal one-time codes
            </p>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/login', { method: 'DELETE' })
              router.push('/')
            }}
            className="text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b66] uppercase transition-colors mt-1"
          >
            Lock vault
          </button>
        </div>

        {!vaultUnlocked && (
          <div className="border border-[#c8a84b22] bg-[#c8a84b05] p-4 mb-5">
            <p className="text-[#c8a84b55] text-xs tracking-[0.2em] uppercase mb-3">
              Unlock custom services
            </p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="password"
                value={vaultPassphrase}
                onChange={(e) => setVaultPassphrase(e.target.value)}
                placeholder={hasEncryptedVault ? 'Enter custom vault passphrase' : 'Create custom vault passphrase'}
                className="flex-1 bg-transparent border border-[#c8a84b22] px-3 py-2 text-[#c8a84b] text-sm tracking-wider focus:outline-none focus:border-[#c8a84b55]"
              />
              <button
                onClick={() => { void unlockOrCreateVault() }}
                disabled={busy}
                className="border border-[#c8a84b33] px-4 py-2 text-[#c8a84b] text-xs tracking-[0.16em] uppercase hover:bg-[#c8a84b10] transition-colors disabled:opacity-40"
              >
                {busy ? 'Working...' : hasEncryptedVault ? 'Unlock' : 'Create vault'}
              </button>
            </div>
            {vaultError && <p className="text-red-400 text-xs mt-3 tracking-wider">{vaultError}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="border border-[#c8a84b1f] bg-[#c8a84b05] px-4 py-3">
            <p className="text-[#c8a84b33] text-[10px] uppercase tracking-[0.24em]">Items</p>
            <p className="text-[#c8a84b] text-lg mt-1">{SERVICES.length + customServices.length}</p>
          </div>
          <div className="border border-[#c8a84b1f] bg-[#c8a84b05] px-4 py-3">
            <p className="text-[#c8a84b33] text-[10px] uppercase tracking-[0.24em]">Favorites</p>
            <p className="text-[#c8a84b] text-lg mt-1">{favoriteCount}</p>
          </div>
          <div className="border border-[#c8a84b1f] bg-[#c8a84b05] px-4 py-3">
            <p className="text-[#c8a84b33] text-[10px] uppercase tracking-[0.24em]">Recently used</p>
            <p className="text-[#c8a84b] text-lg mt-1">{seenCount}</p>
          </div>
        </div>

        <div className="border border-[#c8a84b1a] bg-[#c8a84b05] p-3 mb-3 flex flex-col md:flex-row gap-2 md:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services"
            className="flex-1 bg-transparent text-[#c8a84b] placeholder-[#c8a84b33] text-sm tracking-wider focus:outline-none"
          />
          <button
            onClick={() => setShowAdd((v) => !v)}
            disabled={!vaultUnlocked}
            className="border border-[#c8a84b33] px-4 py-2 text-[#c8a84b] text-xs tracking-[0.16em] uppercase hover:bg-[#c8a84b10] transition-colors disabled:opacity-40"
          >
            {showAdd ? 'Close add' : 'Add service'}
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addCustomService} className="border border-[#c8a84b1a] bg-[#c8a84b04] p-4 mb-4 space-y-3">
            <p className="text-[#c8a84b55] text-xs tracking-[0.2em] uppercase">New custom service</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Service name"
              className="w-full bg-transparent border border-[#c8a84b22] px-3 py-2 text-[#c8a84b] text-sm tracking-wider focus:outline-none focus:border-[#c8a84b55]"
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-transparent border border-[#c8a84b22] px-3 py-2 text-[#c8a84b] text-sm tracking-wider focus:outline-none focus:border-[#c8a84b55]"
            />
            <textarea
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="Base32 secret or full otpauth:// URI"
              rows={3}
              className="w-full bg-transparent border border-[#c8a84b22] px-3 py-2 text-[#c8a84b] text-xs tracking-wider focus:outline-none focus:border-[#c8a84b55]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="border border-[#c8a84b22] px-3 py-2 text-[#c8a84b44] text-xs tracking-[0.16em] uppercase hover:border-[#c8a84b33] hover:text-[#c8a84b66]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="border border-[#c8a84b33] px-4 py-2 text-[#c8a84b] text-xs tracking-[0.16em] uppercase hover:bg-[#c8a84b10] transition-colors disabled:opacity-40"
              >
                {busy ? 'Saving...' : 'Save service'}
              </button>
            </div>
            {vaultError && <p className="text-red-400 text-xs tracking-wider">{vaultError}</p>}
          </form>
        )}

        <div className="border border-[#c8a84b1a] divide-y divide-[#c8a84b12]">
          {visibleServices.length === 0 && (
            <div className="px-4 py-10 text-center text-[#c8a84b33] text-xs tracking-[0.2em] uppercase">
              No matching services
            </div>
          )}

          {visibleServices.map((service) => (
            <div key={service.id} className="px-4 py-4 flex items-center justify-between gap-3 bg-[#c8a84b04]">
              <button
                onClick={() => beginRecitation(service)}
                className="text-left flex-1 min-w-0"
              >
                <p className="text-[#c8a84b] text-sm tracking-wider font-medium truncate">
                  {service.name}
                </p>
                <p className="text-[#c8a84b44] text-xs tracking-wider mt-1 truncate">
                  {service.description}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[10px] tracking-[0.18em] uppercase text-[#c8a84b33]">
                  <span>{service.source === 'custom' ? 'Custom' : 'Managed'}</span>
                  <span>Last used {hydrated ? formatLastUsed(service.seenAt) : '...'}</span>
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleFavorite(service.id)}
                  className="h-9 w-9 border border-[#c8a84b22] text-[#c8a84b55] hover:text-[#c8a84b] hover:border-[#c8a84b44] transition-colors"
                  aria-label={service.pinned ? `Unfavorite ${service.name}` : `Favorite ${service.name}`}
                >
                  {service.pinned ? '★' : '☆'}
                </button>
                {service.source === 'custom' && (
                  <button
                    onClick={() => { void deleteCustomService(service.id) }}
                    disabled={busy}
                    className="h-9 px-3 border border-[#c8a84b22] text-[#c8a84b44] text-xs tracking-[0.12em] uppercase hover:border-red-400/40 hover:text-red-300 transition-colors disabled:opacity-40"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => beginRecitation(service)}
                  className="h-9 px-4 border border-[#c8a84b33] text-[#c8a84b] text-xs tracking-[0.16em] uppercase hover:bg-[#c8a84b10] transition-colors"
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
