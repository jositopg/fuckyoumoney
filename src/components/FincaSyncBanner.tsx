import { Building2, RefreshCw } from 'lucide-react'

interface FincaSyncBannerProps {
  lastSync?: string | null
  busy?: boolean
  error?: string | null
  propertyCount?: number
  onSync: () => void
}

export function FincaSyncBanner({ lastSync, busy, error, propertyCount, onSync }: FincaSyncBannerProps) {
  return (
    <div className="mb-4 rounded-xl bg-surface-container-lowest shadow-soft px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-container/50 flex items-center justify-center text-primary">
          <Building2 size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label font-semibold text-on-surface font-body">Inmuebles (Finca)</p>
          <p className="text-label-sm text-on-surface/50 font-body">
            {error
              ? error
              : propertyCount
                ? `${propertyCount} propiedades · solo lectura`
                : lastSync
                  ? 'Sincronizado'
                  : 'Aún no sincronizado'}
          </p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={busy}
          className="w-9 h-9 rounded-xl flex items-center justify-center
            bg-surface-container-low text-on-surface/60 hover:text-on-surface
            disabled:opacity-50"
          aria-label="Sincronizar Finca"
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
