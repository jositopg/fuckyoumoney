import { Download, X } from 'lucide-react'

interface ExportReminderBannerProps {
  onExport: () => void
  onDismiss: () => void
}

export function ExportReminderBanner({ onExport, onDismiss }: ExportReminderBannerProps) {
  return (
    <div className="mx-0 mb-5 bg-primary-container/60 rounded-xl p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Download size={15} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-label font-semibold text-on-surface font-body mb-0.5">
          Haz una copia de seguridad
        </p>
        <p className="text-label-sm text-on-surface/60 font-body leading-relaxed">
          Tus datos viven en este dispositivo. Expórtalos para no perderlos.
        </p>
        <button
          onClick={onExport}
          className="mt-2.5 text-label font-semibold text-primary font-body underline underline-offset-2"
        >
          Exportar ahora
        </button>
      </div>
      <button
        onClick={onDismiss}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface/40
          hover:bg-surface-container-low hover:text-on-surface/70 transition-colors flex-shrink-0"
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>
    </div>
  )
}
