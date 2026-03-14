'use client'
import { useRouter } from 'next/navigation'
import { SERVICES } from '@/lib/services'

export default function VaultPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-black px-6 py-12">
      <div className="max-w-md mx-auto">
        <div className="mb-10">
          <p className="text-xs tracking-[0.3em] text-[#c8a84b44] uppercase mb-1">Vault</p>
          <h1 className="text-xl font-light text-[#c8a84b] tracking-widest">Select service</h1>
          <p className="text-xs text-[#c8a84b33] mt-2 tracking-wider">You will be asked to read a passage aloud</p>
        </div>

        <div className="space-y-2">
          {SERVICES.map(service => (
            <button
              key={service.id}
              onClick={() => router.push(`/read?service=${service.id}`)}
              className="w-full text-left border border-[#c8a84b1a] hover:border-[#c8a84b44] bg-[#c8a84b05] hover:bg-[#c8a84b0a] transition-all p-5 group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#c8a84b] text-sm tracking-wider font-medium">{service.name}</p>
                  <p className="text-[#c8a84b44] text-xs tracking-wider mt-1">{service.description}</p>
                </div>
                <span className="text-[#c8a84b22] group-hover:text-[#c8a84b66] text-lg transition-colors">›</span>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={async () => {
            await fetch('/api/login', { method: 'DELETE' })
            router.push('/')
          }}
          className="mt-12 text-xs tracking-[0.2em] text-[#c8a84b22] hover:text-[#c8a84b66] uppercase transition-colors"
        >
          Lock vault
        </button>
      </div>
    </main>
  )
}
