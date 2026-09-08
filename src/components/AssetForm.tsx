import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type {
  Asset,
  AssetCategory,
  CashJob,
  CashMetadata,
  CryptoMetadata,
  DebtMetadata,
  InvestAssetClass,
  InvestRegion,
  PensionMetadata,
  StockKind,
  StocksMetadata,
} from '../types'
import {
  CASH_JOB_LABELS,
  CASH_PURPOSE_JOBS,
  CATEGORY_LABELS,
  INVEST_CLASS_LABELS,
  INVEST_REGION_LABELS,
  PARKED_REASON_PRESETS,
  STOCK_KIND_LABELS,
} from '../types'
import { BottomSheet } from './BottomSheet'
import { isISIN } from '../utils/priceUpdater'
import { inferInvestment, looksLikeInvestment } from '../utils/inferInvestment'

interface AssetFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => void
  onDelete?: () => void
  editAsset?: Asset | null
}

type Kind = 'cash' | 'invest' | 'debt' | 'other'

const KIND_LABELS: Record<Kind, string> = {
  cash: 'Cuenta',
  invest: 'Inversión',
  debt: 'Deuda',
  other: 'Otro',
}

function kindFromCategory(cat: AssetCategory): Kind {
  if (cat === 'cash') return 'cash'
  if (cat === 'debt') return 'debt'
  if (cat === 'stocks' || cat === 'crypto' || cat === 'commodities' || cat === 'pension') return 'invest'
  return 'other'
}

function parseEur(raw: string): number {
  const s = raw.trim().replace(/€/g, '').trim()
  if (!s) return NaN
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'))
  return Number(s)
}

const inputClass =
  'w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5 font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2 focus:ring-primary/30'

export function AssetForm({ isOpen, onClose, onSave, onDelete, editAsset }: AssetFormProps) {
  const [kind, setKind] = useState<Kind>('cash')
  const [category, setCategory] = useState<AssetCategory>('cash')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [debtType, setDebtType] = useState<NonNullable<DebtMetadata['debtType']>>('hipoteca')
  const [monthlyPayment, setMonthlyPayment] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [cashJob, setCashJob] = useState<CashJob>('idle')
  const [parkedReason, setParkedReason] = useState('')
  const [notes, setNotes] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [error, setError] = useState('')
  const [stockKind, setStockKind] = useState<StockKind>('etf')
  const [region, setRegion] = useState<InvestRegion>('world')
  const [assetClass, setAssetClass] = useState<InvestAssetClass>('equity')
  const [broker, setBroker] = useState('')

  useEffect(() => {
    if (!isOpen) return
    if (editAsset) {
      const k = kindFromCategory(editAsset.category)
      setKind(k)
      setCategory(editAsset.category)
      setName(editAsset.name)
      setValue(String(editAsset.value))
      setSymbol(editAsset.symbol || '')
      const sm = editAsset.metadata as StocksMetadata | CryptoMetadata | undefined
      setQuantity(sm?.quantity != null ? String(sm.quantity) : '')
      const dm = editAsset.metadata as DebtMetadata | undefined
      setDebtType(dm?.debtType || 'hipoteca')
      setMonthlyPayment(dm?.monthlyPayment != null ? String(dm.monthlyPayment) : '')
      const cm = editAsset.metadata as CashMetadata | DebtMetadata | undefined
      setInterestRate(cm?.interestRate != null ? String(cm.interestRate) : '')
      const cashMeta = editAsset.metadata as CashMetadata | undefined
      setCashJob(
        cashMeta?.job === 'emergency' || cashMeta?.job === 'parked' ? cashMeta.job : 'idle'
      )
      setParkedReason(cashMeta?.parkedReason || '')
      const st = editAsset.metadata as StocksMetadata | PensionMetadata | undefined
      setStockKind(st && 'assetType' in st && st.assetType ? st.assetType : 'etf')
      setRegion(st && 'region' in st && st.region ? st.region : 'world')
      setAssetClass(st && 'assetClass' in st && st.assetClass ? st.assetClass : 'equity')
      setBroker(
        (st && 'broker' in st && st.broker) ||
          (st && 'manager' in st && st.manager) ||
          ''
      )
      setNotes(editAsset.notes || '')
      setShowMore(Boolean(dm?.monthlyPayment || editAsset.notes))
    } else {
      setKind('cash')
      setCategory('cash')
      setName('')
      setValue('')
      setSymbol('')
      setQuantity('')
      setDebtType('hipoteca')
      setMonthlyPayment('')
      setInterestRate('')
      setCashJob('idle')
      setParkedReason('')
      setStockKind('etf')
      setRegion('world')
      setAssetClass('equity')
      setBroker('')
      setNotes('')
      setShowMore(false)
    }
    setError('')
  }, [isOpen, editAsset])

  function applyKind(next: Kind) {
    setKind(next)
    if (next === 'cash') setCategory('cash')
    if (next === 'invest') setCategory('stocks')
    if (next === 'debt') setCategory('debt')
    if (next === 'other') setCategory('other')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editAsset?.readOnly) return
    const v = parseEur(value)
    if (!name.trim()) {
      setError('Ponle un nombre')
      return
    }
    if (Number.isNaN(v) || v < 0) {
      setError('Importe no válido')
      return
    }
    if (kind === 'cash' && cashJob === 'parked' && !parkedReason.trim()) {
      setError('Di el motivo del apartado (reforma, juicio, impuestos…)')
      return
    }
    const guessed = inferInvestment(name, symbol, notes)
    let cat = category
    if (kind === 'other' && looksLikeInvestment(name, symbol, notes) && guessed.category === 'stocks') {
      cat = 'stocks'
    }
    if (kind === 'other' && guessed.category === 'crypto') cat = 'crypto'
    if (kind === 'other' && guessed.category === 'pension') cat = 'pension'

    const rate = interestRate ? Number(interestRate.replace(',', '.')) : undefined
    let metadata: Asset['metadata']
    if (cat === 'cash') {
      const prev = editAsset?.metadata as CashMetadata | undefined
      metadata = {
        ...prev,
        job: cashJob,
        interestRate: rate,
        parkedReason: cashJob === 'parked' ? parkedReason.trim() || undefined : undefined,
      }
    } else if (cat === 'debt') {
      metadata = {
        debtType,
        monthlyPayment: monthlyPayment ? parseEur(monthlyPayment) : undefined,
        interestRate: rate,
      }
    } else if (cat === 'stocks') {
      const qty = quantity ? Number(quantity.replace(',', '.')) : undefined
      const idRaw = (symbol.trim() || guessed.isin || guessed.ticker || '').toUpperCase()
      const asIsin = Boolean(idRaw) && isISIN(idRaw)
      const prev = editAsset?.metadata as StocksMetadata | undefined
      const userPickedKind = stockKind !== 'etf' || Boolean(editAsset)
      metadata = {
        ...prev,
        assetType: userPickedKind ? stockKind : guessed.assetType || stockKind,
        identifierType: asIsin ? 'isin' : idRaw ? 'ticker' : undefined,
        isin: asIsin ? idRaw : guessed.isin || prev?.isin,
        quantity: qty,
        pricePerUnit: qty && qty > 0 ? v / qty : undefined,
        canAutoUpdate: Boolean(idRaw || guessed.ticker) && (userPickedKind ? stockKind : guessed.assetType) !== 'fondo_activo',
        region: region !== 'world' || Boolean(editAsset) ? region : guessed.region || region,
        assetClass: assetClass !== 'equity' || Boolean(editAsset) ? assetClass : guessed.assetClass || assetClass,
        broker: broker.trim() || guessed.broker,
      }
    } else if (cat === 'crypto') {
      const qty = quantity ? Number(quantity.replace(',', '.')) : undefined
      metadata = { quantity: qty, pricePerUnit: qty && qty > 0 ? v / qty : undefined }
    } else if (cat === 'pension') {
      metadata = { manager: broker.trim() || guessed.broker || undefined }
    }

    const symbolOut = (symbol.trim() || guessed.isin || guessed.ticker || '').trim()
    onSave({
      category: cat,
      name: name.trim(),
      value: v,
      symbol: symbolOut ? (cat === 'stocks' ? symbolOut.toUpperCase() : symbolOut) : undefined,
      notes: notes.trim() || undefined,
      metadata,
      source: editAsset?.source ?? 'manual',
      readOnly: false,
    })
    onClose()
  }

  const readOnly = Boolean(editAsset?.readOnly)

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={editAsset ? 'Editar' : 'Añadir'}>
      <form onSubmit={handleSubmit} className="space-y-5 mt-2">
        {readOnly && (
          <p className="rounded-xl bg-primary-container/30 px-4 py-3 text-label font-body text-on-surface/80">
            Viene de Finca. Aquí no se edita.
          </p>
        )}

        <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
          {!editAsset && (
            <div>
              <p className="text-label font-medium text-on-surface/70 mb-2 font-body">Qué es</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(KIND_LABELS) as Kind[]).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => applyKind(k)}
                    className={`rounded-xl py-2.5 text-label font-body font-medium ${
                      kind === k ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface/70'
                    }`}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === 'invest' && (
            <div>
              <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Tipo</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as AssetCategory)}
                className={inputClass + ' appearance-none'}
              >
                <option value="stocks">Fondo / acción / ETF</option>
                <option value="crypto">Cripto</option>
                <option value="pension">Pensión / PIAS</option>
                <option value="commodities">Oro / metal</option>
              </select>
            </div>
          )}

          {kind === 'other' && (
            <div>
              <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Tipo</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as AssetCategory)}
                className={inputClass + ' appearance-none'}
              >
                <option value="other">Otro</option>
                <option value="business">Negocio / participación</option>
                <option value="receivable">Me deben</option>
                <option value="vehicles">Vehículo</option>
              </select>
            </div>
          )}

          {kind === 'debt' && (
            <div>
              <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Tipo de deuda</label>
              <select
                value={debtType}
                onChange={e => setDebtType(e.target.value as DebtMetadata['debtType'] as typeof debtType)}
                className={inputClass + ' appearance-none'}
              >
                <option value="hipoteca">Hipoteca</option>
                <option value="prestamo_personal">Préstamo personal</option>
                <option value="prestamo_coche">Préstamo coche</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="otro">Otra</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Nombre</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={
                kind === 'cash'
                  ? 'BBVA, Trade Republic…'
                  : kind === 'invest' && category === 'stocks'
                    ? 'Vanguard FTSE All-World, VWCE…'
                    : 'Nombre'
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
              {kind === 'debt' ? 'Pendiente €' : 'Valor €'}
            </label>
            <input
              inputMode="decimal"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          {kind === 'invest' && category === 'stocks' && (
            <div className="space-y-4">
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Instrumento</label>
                <select
                  value={stockKind}
                  onChange={e => setStockKind(e.target.value as StockKind)}
                  className={inputClass + ' appearance-none'}
                >
                  {(Object.keys(STOCK_KIND_LABELS) as StockKind[]).map(k => (
                    <option key={k} value={k}>
                      {STOCK_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
                  Ticker o ISIN
                </label>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value)}
                  placeholder="VWCE.DE o IE00BK5BQT80"
                  className={inputClass}
                />
                <p className="text-label-sm text-on-surface/45 font-body mt-1.5">
                  Opcional. Si el nombre ya dice qué es (Inbestme, VWCE, Numantia…), lo reconocemos.
                </p>
              </div>
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Participaciones</label>
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Opcional"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Zona</label>
                <select
                  value={region}
                  onChange={e => setRegion(e.target.value as InvestRegion)}
                  className={inputClass + ' appearance-none'}
                >
                  {(Object.keys(INVEST_REGION_LABELS) as InvestRegion[]).map(k => (
                    <option key={k} value={k}>
                      {INVEST_REGION_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Clase</label>
                <select
                  value={assetClass}
                  onChange={e => setAssetClass(e.target.value as InvestAssetClass)}
                  className={inputClass + ' appearance-none'}
                >
                  {(Object.keys(INVEST_CLASS_LABELS) as InvestAssetClass[]).map(k => (
                    <option key={k} value={k}>
                      {INVEST_CLASS_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Broker</label>
                <input
                  value={broker}
                  onChange={e => setBroker(e.target.value)}
                  placeholder="Indexa, MyInvestor, IBKR…"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {kind === 'invest' && category === 'crypto' && (
            <div className="space-y-4">
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Ticker</label>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value)}
                  placeholder="BTC, ETH…"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Cantidad</label>
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {kind === 'invest' && category === 'pension' && (
            <div>
              <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Gestor</label>
              <input
                value={broker}
                onChange={e => setBroker(e.target.value)}
                placeholder="Indexa, Caser, empleo…"
                className={inputClass}
              />
            </div>
          )}

          {kind === 'cash' && (
            <div>
              <p className="text-label font-medium text-on-surface/70 mb-2 font-body">Para qué es</p>
              <div className="grid grid-cols-3 gap-2">
                {CASH_PURPOSE_JOBS.map(job => (
                  <button
                    key={job}
                    type="button"
                    onClick={() => setCashJob(job)}
                    className={`rounded-xl py-2.5 text-label font-body font-medium ${
                      cashJob === job ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface/70'
                    }`}
                  >
                    {CASH_JOB_LABELS[job]}
                  </button>
                ))}
              </div>
              <p className="text-label-sm text-on-surface/45 font-body mt-2 leading-relaxed">
                {cashJob === 'emergency' &&
                  'Vida. Puede estar en cuenta remunerada; eso no es invertirlo.'}
                {cashJob === 'parked' &&
                  'Un gasto concreto: reforma, juicio, impuestos, entrada… No es el colchón.'}
                {cashJob === 'idle' && 'Sin motivo. Debería estar en fondos, no en cuenta.'}
              </p>
              {cashJob === 'parked' && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {PARKED_REASON_PRESETS.map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setParkedReason(preset)}
                        className={`rounded-lg px-3 py-1.5 text-label-sm font-body ${
                          parkedReason === preset
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-highest text-on-surface/70'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    value={parkedReason}
                    onChange={e => setParkedReason(e.target.value)}
                    placeholder="Motivo concreto"
                    className={inputClass}
                  />
                </div>
              )}
              <div className="mt-3">
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
                  TAE % {cashJob === 'idle' ? '(no sustituye a invertirlo)' : '(opcional)'}
                </label>
                <input
                  inputMode="decimal"
                  value={interestRate}
                  onChange={e => setInterestRate(e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMore(s => !s)}
            className="text-label text-primary font-body"
          >
            {showMore ? 'Menos detalle' : 'Más detalle (opcional)'}
          </button>

          {showMore && (
            <div className="space-y-4">
              {kind === 'debt' && (
                <>
                  <div>
                    <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Cuota €/mes</label>
                    <input inputMode="decimal" value={monthlyPayment} onChange={e => setMonthlyPayment(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">TIN %</label>
                    <input inputMode="decimal" value={interestRate} onChange={e => setInterestRate(e.target.value)} className={inputClass} />
                  </div>
                </>
              )}
              <div>
                <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">Notas</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputClass + ' resize-none'} />
              </div>
            </div>
          )}
        </fieldset>

        {error && <p className="text-label-sm text-error font-body">{error}</p>}

        {readOnly ? (
          <button type="button" onClick={onClose} className="w-full bg-surface-container-low text-on-surface rounded-xl py-4 font-display font-semibold">
            Cerrar
          </button>
        ) : (
          <div className={`flex gap-3 ${editAsset ? 'flex-col' : ''}`}>
            <button
              type="submit"
              className="flex-1 bg-primary text-on-primary rounded-xl py-4 font-display font-semibold text-body hover:bg-primary-dim"
            >
              {editAsset ? 'Guardar' : 'Añadir'}
            </button>
            {editAsset && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-error font-body font-medium bg-surface-container-low"
              >
                <Trash2 size={16} /> Borrar
              </button>
            )}
          </div>
        )}
        {editAsset && (
          <p className="text-label-sm text-on-surface/35 font-body text-center">{CATEGORY_LABELS[editAsset.category]}</p>
        )}
      </form>
    </BottomSheet>
  )
}
