import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { askWealthAi } from '../lib/fincaSync'

interface AiChatSheetProps {
  isOpen: boolean
  onClose: () => void
  loggedIn: boolean
}

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

export function AiChatSheet({ isOpen, onClose, loggedIn }: AiChatSheetProps) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setError(null)
    setTurns(prev => [...prev, { role: 'user', text: message }])
    setBusy(true)
    try {
      const text = await askWealthAi(message)
      setTurns(prev => [...prev, { role: 'assistant', text }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar la IA')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Analista de patrimonio">
      <div className="mt-2 space-y-4">
        <p className="text-label text-on-surface/50 font-body leading-relaxed">
          Pregunta sobre tu patrimonio. La IA lee la base de datos; no inventa cifras.
        </p>
        {!loggedIn && (
          <p className="text-label text-error font-body">Inicia sesión en Ajustes para usarla.</p>
        )}
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {turns.map((t, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 text-label font-body leading-relaxed whitespace-pre-wrap ${
                t.role === 'user'
                  ? 'bg-primary-container/40 text-on-surface ml-6'
                  : 'bg-surface-container-low text-on-surface mr-4'
              }`}
            >
              {t.text}
            </div>
          ))}
          {busy && <p className="text-label-sm text-on-surface/40 font-body">Pensando…</p>}
        </div>
        {error && <p className="text-label-sm text-error font-body">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!loggedIn || busy}
            placeholder="¿Qué % es ilíquido? ¿Y si vendo un piso?"
            className="flex-1 bg-surface-container-highest text-on-surface rounded-xl px-4 py-3
              font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
              focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={!loggedIn || busy || !input.trim()}
            className="px-4 rounded-xl bg-primary text-on-primary font-body text-label font-semibold
              disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
      </div>
    </BottomSheet>
  )
}
