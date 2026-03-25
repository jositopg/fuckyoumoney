import { BottomSheet } from './BottomSheet'

interface PhilosophySheetProps {
  isOpen: boolean
  onClose: () => void
}

const SECTIONS = [
  {
    title: '¿Qué es el Fuck You Money?',
    content: 'No es una cantidad. Es una actitud. Es tener suficiente para poder decir no cuando importa. No necesitas ser millonario — necesitas tener más de lo que gastas, durante más tiempo del que te asusta.',
  },
  {
    title: 'La autonomía es el objetivo',
    content: 'El indicador que importa no es tu patrimonio en euros. Es cuánto tiempo puedes vivir sin depender de nadie. Un mes de autonomía vale más que un coche nuevo. Doce meses de autonomía cambian la forma en que negocias, trabajas y vives.',
  },
  {
    title: 'El dinero vale por lo que te quita',
    content: 'No son los lujos que añade. Son los problemas que elimina. La hipoteca que no tienes. El jefe al que puedes decirle que no. El proyecto que puedes rechazar sin que te tiemble la voz. El dinero bien gestionado compra silencio, tiempo y margen.',
  },
  {
    title: 'El desprecio honesto',
    content: 'El dinero es más fácil de conseguir cuando ya no lo necesitas. Esa es la ironía. No es un truco — es que cuando no lo necesitas dejas de tomar malas decisiones por miedo. El desapego no se finge: se construye ahorrando.',
  },
  {
    title: 'Lo que esta app no es',
    content: 'No es un tracker de gastos. No es una app de inversión. No compara tu patrimonio con otros. No tiene notificaciones. No proyecta futuros ni simula escenarios complejos. Es un espejo: te muestra dónde estás, sin juzgarte.',
  },
]

export function PhilosophySheet({ isOpen, onClose }: PhilosophySheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="La filosofía">
      <div className="space-y-6 mt-2 pb-4">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <h3 className="font-display font-semibold text-on-surface mb-2">
              {section.title}
            </h3>
            <p className="text-body text-on-surface/70 font-body leading-relaxed">
              {section.content}
            </p>
          </div>
        ))}

        <div className="bg-surface-container-low rounded-xl px-4 py-3 mt-2">
          <p className="text-body text-on-surface/60 font-body leading-relaxed italic">
            "Tu economía actual refleja tu momento actual."
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}
