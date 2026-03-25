interface OnboardingScreenProps {
  onStart: () => void
}

interface PrivacyPoint {
  icon: string
  title: string
  description: string
}

const POINTS: PrivacyPoint[] = [
  {
    icon: '📱',
    title: 'Todo se queda en tu dispositivo',
    description:
      'Tus datos se guardan únicamente en el almacenamiento local de este navegador. No existe ningún servidor, base de datos ni cuenta donde se almacene tu información.',
  },
  {
    icon: '🔒',
    title: 'Cero datos personales recogidos',
    description:
      'La app no recoge ningún dato personal. No hay registro, no hay email, no hay nombre. Ni siquiera sabemos que existes.',
  },
  {
    icon: '📡',
    title: 'Sin rastreo ni analítica',
    description:
      'No hay cookies de seguimiento, no hay Google Analytics, no hay ningún tercero que observe lo que haces aquí.',
  },
  {
    icon: '💾',
    title: 'Cómo funciona el almacenamiento web',
    description:
      'Los datos viven en el localStorage de este navegador. Si borras el caché o los datos del sitio, los perderás. Por eso es importante exportar una copia de seguridad regularmente desde Ajustes.',
  },
]

export function OnboardingScreen({ onStart }: OnboardingScreenProps) {
  return (
    <div className="min-h-dvh bg-surface flex flex-col px-6 py-10 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-10 pt-4">
        <p className="text-label font-display font-semibold text-on-surface/40 tracking-tight mb-6">
          F*ck You Money
        </p>
        <h1
          className="font-display font-bold text-on-surface leading-tight mb-3"
          style={{ fontSize: 'clamp(1.75rem, 7vw, 2.5rem)', letterSpacing: '-0.02em' }}
        >
          Antes de empezar
        </h1>
        <p className="text-body text-on-surface/60 font-body leading-relaxed">
          Esta app tiene un principio innegociable: tu información financiera no le pertenece a nadie más que a ti.
        </p>
      </div>

      {/* Privacy points */}
      <div className="flex-1 space-y-4 mb-10">
        {POINTS.map((point) => (
          <div
            key={point.title}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-soft flex gap-4"
          >
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-xl flex-shrink-0"
            >
              {point.icon}
            </div>
            <div>
              <p className="text-label font-semibold text-on-surface font-body mb-1">
                {point.title}
              </p>
              <p className="text-label-sm text-on-surface/60 font-body leading-relaxed">
                {point.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* GDPR note */}
      <div className="mb-6 bg-primary-container/40 rounded-xl px-4 py-3">
        <p className="text-label-sm text-on-surface/60 font-body leading-relaxed">
          Al no recoger ningún dato personal, esta app no requiere consentimiento GDPR. No hay nada que aceptar porque no hay nada que ceder.
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={onStart}
        className="w-full bg-primary text-on-primary rounded-xl py-4 font-display font-semibold
          text-body transition-all hover:bg-primary-dim active:scale-[0.98]"
      >
        Entendido, empezar
      </button>
    </div>
  )
}
