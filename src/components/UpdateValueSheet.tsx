import { useEffect, useState } from 'react'
import type { Asset, CashMetadata } from '../types'
import { CASH_JOB_LABELS } from '../types'
import { cashJob } from '../utils/moneyDiagnosis'
import { formatEur } from '../utils/calculations'
import { formatAsOf, formatEurInput, parseEur } from '../utils/declaredValue'
import { BottomSheet } from './BottomSheet'

interface UpdateValueSheetProps {
  isOpen: boolean
  asset: Asset | null
  step?: number
  total?: number
  onClose: () => void
  onConfirm: (value: number) => void
  onSkip?: () => void
  onEditDetails: () => void
}

function jobLine(asset: Asset): string | null {
  if (asset.category !== 'cash') return null
  const job = cashJob(asset)
  const reason = (asset.metadata as CashMetadata | undefined)?.parkedReason
  if (job === 'parked') return reason ? `Apartado · ${reason}` : 'Apartado'
  return CASH_JOB_LABELS[job]
}

export function UpdateValueSheet({
  isOpen,
  asset,
  step,
  total,
  onClose,
  onConfirm,
  onSkip,
  onEditDetails,
}: UpdateValueSheetProps) {
  const [raw, setRaw] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !asset) return
    setRaw(formatEurInput(asset.value))
    setError('')
  }, [isOpen, asset])

  if (!asset) return null

  const parsed = parseEur(raw)
  const dirty = Number.isFinite(parsed) && Math.round(parsed * 100) !== Math.round(asset.value * 100)
  const queued = total != null && total > 1
  const title = queued ? `${step ?? 1} / ${total}` : 'Importe'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseEur(raw)
    if (Number.isNaN(v) || v < 0) {
      setError('Importe no válido')
      return
    }
    onConfirm(v)
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-5 mt-1">
        <div>
          <p className="font-display font-semibold text-on-surface text-headline leading-tight">{asset.name}</p>
          {jobLine(asset) && (
            <p className="text-label text-on-surface/50 font-body mt-1">{jobLine(asset)}</p>
          )}
          <p className="text-label-sm text-on-surface/40 font-body mt-1">
            Foto del {formatAsOf(asset.updatedAt)} · {formatEur(asset.value)}
          </p>
        </div>

        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Saldo € </label>
          <input
            inputMode="decimal"
            value={raw}
            onChange={e => {
              setRaw(e.target.value)
              setError('')
            }}
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
              font-display font-semibold text-headline tabular-nums placeholder:text-on-surface/30
              focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {error && <p className="text-label-sm text-error font-body">{error}</p>}

        <button
          type="submit"
          className="w-full bg-primary text-on-primary rounded-xl py-4 font-display font-semibold
            hover:bg-primary-dim active:scale-[0.98] transition-all"
        >
          {dirty ? 'Guardar' : 'Sigue igual'}
        </button>

        {queued && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full text-label font-body text-on-surface/50 py-1"
          >
            Ahora no
          </button>
        )}

        <button
          type="button"
          onClick={onEditDetails}
          className="w-full text-label font-body text-primary py-1"
        >
          Editar ficha
        </button>
      </form>
    </BottomSheet>
  )
}
