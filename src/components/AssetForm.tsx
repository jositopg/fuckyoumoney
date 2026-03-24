import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import type { Asset, AssetCategory } from '../types'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types'
import { BottomSheet } from './BottomSheet'
interface AssetFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => void
  onDelete?: () => void
  editAsset?: Asset | null
}

const SYMBOL_CATEGORIES: AssetCategory[] = ['stocks', 'crypto']

export function AssetForm({ isOpen, onClose, onSave, onDelete, editAsset }: AssetFormProps) {
  const [category, setCategory] = useState<AssetCategory>('cash')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [symbol, setSymbol] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      if (editAsset) {
        setCategory(editAsset.category)
        setName(editAsset.name)
        setValue(editAsset.value.toString())
        setSymbol(editAsset.symbol || '')
        setNotes(editAsset.notes || '')
      } else {
        setCategory('cash')
        setName('')
        setValue('')
        setSymbol('')
        setNotes('')
      }
      setErrors({})
    }
  }, [isOpen, editAsset])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'El nombre es obligatorio'
    const num = parseFloat(value.replace(',', '.'))
    if (isNaN(num) || num < 0) e.value = 'Introduce un valor válido (mayor o igual a 0)'
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    const num = parseFloat(value.replace(',', '.'))
    onSave({
      category,
      name: name.trim(),
      value: num,
      symbol: symbol.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const showSymbol = SYMBOL_CATEGORIES.includes(category)
  const isDebt = category === 'debt'

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={editAsset ? 'Editar activo' : 'Nuevo activo'}
    >
      <form onSubmit={handleSubmit} className="space-y-5 mt-2">
        {/* Category */}
        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
            Tipo
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={e => setCategory(e.target.value as AssetCategory)}
              className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
                font-body text-body appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30
                transition-all"
            >
              {CATEGORY_ORDER.map(cat => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface/40">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
            Nombre
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={isDebt ? 'Ej: Hipoteca, préstamo coche...' : 'Ej: Cuenta BBVA, Bitcoin...'}
            className={`w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
              font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
              transition-all ${errors.name ? 'ring-2 ring-error/40' : 'focus:ring-primary/30'}`}
          />
          {errors.name && (
            <p className="text-label-sm text-error mt-1.5 font-body">{errors.name}</p>
          )}
        </div>

        {/* Value */}
        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
            {isDebt ? 'Importe de la deuda en €' : 'Valor actual en €'}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className={`w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
              font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
              transition-all ${errors.value ? 'ring-2 ring-error/40' : 'focus:ring-primary/30'}`}
          />
          {errors.value && (
            <p className="text-label-sm text-error mt-1.5 font-body">{errors.value}</p>
          )}
          {isDebt && (
            <p className="text-label-sm text-on-surface/50 mt-1.5 font-body">
              Introduce el importe pendiente. Se restará de tu patrimonio.
            </p>
          )}
        </div>

        {/* Symbol (only for stocks/crypto) */}
        {showSymbol && (
          <div>
            <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
              Símbolo / Ticker{' '}
              <span className="text-on-surface/40 font-normal">(opcional, para actualización de precio)</span>
            </label>
            <input
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder={category === 'crypto' ? 'Ej: BTC, ETH, SOL' : 'Ej: AAPL, VOO, MSCI'}
              className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
                font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
                focus:ring-primary/30 transition-all font-mono uppercase"
            />
            {category === 'crypto' && (
              <p className="text-label-sm text-on-surface/50 mt-1.5 font-body">
                Soportados: BTC, ETH, SOL, ADA, DOT, MATIC, AVAX, LINK, UNI, LTC, XRP, DOGE, BNB y más
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
            Notas <span className="text-on-surface/40 font-normal">(opcional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Cualquier detalle adicional..."
            rows={2}
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
              font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
              focus:ring-primary/30 transition-all resize-none"
          />
        </div>

        {/* Actions */}
        <div className={`flex gap-3 pt-2 ${editAsset ? 'flex-col' : ''}`}>
          <button
            type="submit"
            className="flex-1 bg-primary text-on-primary rounded-xl py-4 font-display font-semibold
              text-body transition-all hover:bg-primary-dim active:scale-[0.98]"
          >
            {editAsset ? 'Guardar cambios' : 'Añadir activo'}
          </button>
          {editAsset && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5
                text-error font-body font-medium transition-all
                bg-surface-container-low hover:bg-error/10 active:scale-[0.98]"
            >
              <Trash2 size={16} />
              Eliminar activo
            </button>
          )}
        </div>
      </form>
    </BottomSheet>
  )
}

