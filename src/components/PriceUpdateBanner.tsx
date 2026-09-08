import { Wifi, WifiOff } from 'lucide-react'

interface PriceUpdateBannerProps {
  lastUpdate?: string
  isOnline: boolean
  isUpdating: boolean
}

export function PriceUpdateBanner({ lastUpdate, isOnline, isUpdating }: PriceUpdateBannerProps) {
  if (!lastUpdate && !isUpdating) return null

  function formatTime(isoString: string): string {
    const date = new Date(isoString)
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div aria-live="polite" className="flex items-center gap-1.5 py-2 mb-1">
      {isUpdating ? (
        <>
          <div className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
          <span className="text-label-sm text-on-surface/50 font-body">Foto de precios…</span>
        </>
      ) : isOnline ? (
        <>
          <Wifi size={12} className="text-primary/60" />
          <span className="text-label-sm text-on-surface/40 font-body">
            Fondos al abrir · {lastUpdate ? formatTime(lastUpdate) : '—'}
          </span>
        </>
      ) : (
        <>
          <WifiOff size={12} className="text-on-surface/30" />
          <span className="text-label-sm text-on-surface/40 font-body">
            Último precio guardado
            {lastUpdate && ` · ${formatTime(lastUpdate)}`}
          </span>
        </>
      )}
    </div>
  )
}
