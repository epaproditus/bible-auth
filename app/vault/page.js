'use client'
import { useRouter } from 'next/navigation'
import { SERVICES } from '@/lib/services'

export default function VaultPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="imperial-frame max-w-2xl mx-auto rounded-2xl p-6 md:p-8">
        <div className="mb-10">
          <p className="text-xs tracking-[0.3em] text-[#7fd9ffaa] uppercase mb-1">Vault Console</p>
          <h1 className="crawl-title text-xl font-light">Select Service</h1>
          <p className="text-xs text-[#f4e7b488] mt-2 tracking-[0.16em] uppercase">
            Voice-read the passage to reveal your code
          </p>
        </div>

        <div className="space-y-3">
          {SERVICES.map(service => (
            <button
              key={service.id}
              onClick={() => router.push(`/read?service=${service.id}`)}
              className="w-full text-left border border-[#7fd9ff3d] hover:border-[#7fd9ff99] bg-[#020814aa] hover:bg-[#08182acc] transition-all p-5 group rounded-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#d8f4ff] text-sm tracking-[0.14em] uppercase font-semibold">{service.name}</p>
                  <p className="text-[#f4e7b499] text-xs tracking-[0.1em] mt-1 uppercase">{service.description}</p>
                </div>
                <span className="text-[#7fd9ff77] group-hover:text-[#d8f4ff] text-lg transition-colors">Launch</span>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={async () => {
            await fetch('/api/login', { method: 'DELETE' })
            router.push('/')
          }}
          className="mt-12 text-xs tracking-[0.2em] text-[#f4e7b488] hover:text-[#f4e7b4] uppercase transition-colors"
        >
          Lock vault
        </button>
      </div>
    </main>
  )
}
