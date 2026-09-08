interface OnboardingScreenProps {
  onStart: () => void
}

export function OnboardingScreen({ onStart }: OnboardingScreenProps) {
  return (
    <div className="min-h-dvh bg-surface flex flex-col px-6 py-12 max-w-lg mx-auto">
      <p className="text-label font-display font-semibold text-on-surface/40 tracking-tight mb-10">
        Patrimonio
      </p>
      <h1
        className="font-display font-bold text-on-surface leading-tight mb-4"
        style={{ fontSize: 'clamp(1.75rem, 7vw, 2.4rem)', letterSpacing: '-0.02em' }}
      >
        Todo lo que tienes, en un número.
      </h1>
      <p className="text-body text-on-surface/60 font-body leading-relaxed mb-8">
        Cuentas, fondos, deudas. Los inmuebles llegan solos desde Finca. El número, y qué hace cada euro.
      </p>
      <ul className="space-y-3 text-label font-body text-on-surface/70 mb-12">
        <li>Di qué hace el efectivo: colchón, aparcado, rinde o parado.</li>
        <li>Los inmuebles muestran valor y neto de verdad, no solo el alquiler contratado.</li>
        <li>La misma base la puede leer una IA y decir si estás bien o mal.</li>
      </ul>
      <button
        type="button"
        onClick={onStart}
        className="mt-auto w-full bg-primary text-on-primary rounded-xl py-4 font-display font-semibold text-body
          hover:bg-primary-dim active:scale-[0.98] transition-all"
      >
        Empezar
      </button>
    </div>
  )
}
