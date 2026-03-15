'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SERVICES } from '@/lib/services'

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

export default function VaultPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState([])
  const [lastUsed, setLastUsed] = useState({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const savedFavorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
      if (Array.isArray(savedFavorites)) setFavorites(savedFavorites)

      const savedLastUsed = JSON.parse(localStorage.getItem(LAST_USED_KEY) || '{}')
      if (savedLastUsed && typeof savedLastUsed === 'object') setLastUsed(savedLastUsed)
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

  function toggleFavorite(serviceId) {
    const isFavorite = favorites.includes(serviceId)
    const next = isFavorite
      ? favorites.filter((id) => id !== serviceId)
      : [...favorites, serviceId]
    persistFavorites(next)
  }

  function beginRecitation(serviceId) {
    const next = { ...lastUsed, [serviceId]: Date.now() }
    persistLastUsed(next)
    router.push(`/read?service=${serviceId}`)
  }

  const visibleServices = useMemo(() => {
    const lowered = query.trim().toLowerCase()
    const filtered = SERVICES.filter((service) => {
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
  }, [favorites, lastUsed, query])

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="border border-[#c8a84b1f] bg-[#c8a84b05] px-4 py-3">
            <p className="text-[#c8a84b33] text-[10px] uppercase tracking-[0.24em]">Items</p>
            <p className="text-[#c8a84b] text-lg mt-1">{SERVICES.length}</p>
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

        <div className="border border-[#c8a84b1a] bg-[#c8a84b05] px-4 py-3 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services"
            className="w-full bg-transparent text-[#c8a84b] placeholder-[#c8a84b33] text-sm tracking-wider focus:outline-none"
          />
        </div>

        <div className="border border-[#c8a84b1a] divide-y divide-[#c8a84b12]">
          {visibleServices.length === 0 && (
            <div className="px-4 py-10 text-center text-[#c8a84b33] text-xs tracking-[0.2em] uppercase">
              No matching services
            </div>
          )}

          {visibleServices.map((service) => (
            <div key={service.id} className="px-4 py-4 flex items-center justify-between gap-3 bg-[#c8a84b04]">
              <button
                onClick={() => beginRecitation(service.id)}
                className="text-left flex-1 min-w-0"
              >
                <p className="text-[#c8a84b] text-sm tracking-wider font-medium truncate">
                  {service.name}
                </p>
                <p className="text-[#c8a84b44] text-xs tracking-wider mt-1 truncate">
                  {service.description}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[10px] tracking-[0.18em] uppercase text-[#c8a84b33]">
                  <span>TOTP</span>
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
                <button
                  onClick={() => beginRecitation(service.id)}
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
