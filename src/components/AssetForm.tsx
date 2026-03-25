import { useState, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import type { Asset, AssetCategory, StocksMetadata, CryptoMetadata, CashMetadata, RealEstateMetadata, VehicleMetadata, PensionMetadata, DebtMetadata } from '../types'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types'
import { BottomSheet } from './BottomSheet'
import { formatEur } from '../utils/calculations'
import { isISIN } from '../utils/priceUpdater'

interface AssetFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => void
  onDelete?: () => void
  editAsset?: Asset | null
}

// Reusable field components for consistent styling
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">{label}</label>
      {children}
      {hint && !error && <p className="text-label-sm text-on-surface/50 mt-1.5 font-body">{hint}</p>}
      {error && <p className="text-label-sm text-error mt-1.5 font-body">{error}</p>}
    </div>
  )
}

const inputClass = (hasError?: boolean) =>
  `w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
   font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
   transition-all ${hasError ? 'ring-2 ring-error/40' : 'focus:ring-primary/30'}`

function SelectInput({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputClass() + ' appearance-none'}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface/40">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}

export function AssetForm({ isOpen, onClose, onSave, onDelete, editAsset }: AssetFormProps) {
  const [category, setCategory] = useState<AssetCategory>('cash')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')         // total EUR (manual input)
  const [symbol, setSymbol] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Per-category metadata fields
  // Cash
  const [accountType, setAccountType] = useState('')
  const [interestRate, setInterestRate] = useState('')
  // Stocks / Crypto (shared)
  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  // Crypto extra
  const [wallet, setWallet] = useState('')
  // Stocks extra
  const [assetType, setAssetType] = useState('')
  const [identifierType, setIdentifierType] = useState<'ticker' | 'isin'>('ticker')
  const [resolvedTicker, setResolvedTicker] = useState('')
  // Real estate
  const [propertyType, setPropertyType] = useState('')
  const [rePurchasePrice, setRePurchasePrice] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  // Vehicles
  const [vehicleType, setVehicleType] = useState('')
  const [vehicleYear, setVehicleYear] = useState('')
  // Pension
  const [pensionType, setPensionType] = useState('')
  const [pensionManager, setPensionManager] = useState('')
  const [monthlyContribution, setMonthlyContribution] = useState('')
  // Debt
  const [debtType, setDebtType] = useState('')
  const [debtInterestRate, setDebtInterestRate] = useState('')
  const [monthlyPayment, setMonthlyPayment] = useState('')
  const [dueDate, setDueDate] = useState('')

  // Computed value for stocks/crypto
  const computedValue = useCallback(() => {
    if (category === 'stocks' || category === 'crypto') {
      const q = parseFloat(quantity.replace(',', '.'))
      const p = parseFloat(pricePerUnit.replace(',', '.'))
      if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) return q * p
    }
    return null
  }, [category, quantity, pricePerUnit])

  const computed = computedValue()

  useEffect(() => {
    if (!isOpen) return
    if (editAsset) {
      setCategory(editAsset.category)
      setName(editAsset.name)
      setValue(editAsset.value.toString())
      setSymbol(editAsset.symbol || '')
      setNotes(editAsset.notes || '')

      const m = editAsset.metadata || {}
      // Reset all
      setAccountType(''); setInterestRate('')
      setQuantity(''); setPricePerUnit(''); setPurchasePrice(''); setWallet('')
      setAssetType(''); setPropertyType(''); setRePurchasePrice(''); setMonthlyRent('')
      setVehicleType(''); setVehicleYear('')
      setPensionType(''); setPensionManager(''); setMonthlyContribution('')
      setDebtType(''); setDebtInterestRate(''); setMonthlyPayment(''); setDueDate('')

      if (editAsset.category === 'cash') {
        const cm = m as CashMetadata
        setAccountType(cm.accountType || '')
        setInterestRate(cm.interestRate?.toString() || '')
      } else if (editAsset.category === 'stocks') {
        const sm = m as StocksMetadata
        setAssetType(sm.assetType || '')
        setIdentifierType(sm.identifierType || (isISIN(editAsset.symbol || '') ? 'isin' : 'ticker'))
        setResolvedTicker(sm.resolvedTicker || '')
        setQuantity(sm.quantity?.toString() || '')
        setPricePerUnit(sm.pricePerUnit?.toString() || '')
        setPurchasePrice(sm.purchasePrice?.toString() || '')
      } else if (editAsset.category === 'crypto') {
        const cm = m as CryptoMetadata
        setQuantity(cm.quantity?.toString() || '')
        setPricePerUnit(cm.pricePerUnit?.toString() || '')
        setPurchasePrice(cm.purchasePrice?.toString() || '')
        setWallet(cm.wallet || '')
      } else if (editAsset.category === 'real_estate') {
        const rm = m as RealEstateMetadata
        setPropertyType(rm.propertyType || '')
        setRePurchasePrice(rm.purchasePrice?.toString() || '')
        setMonthlyRent(rm.monthlyRent?.toString() || '')
      } else if (editAsset.category === 'vehicles') {
        const vm = m as VehicleMetadata
        setVehicleType(vm.vehicleType || '')
        setVehicleYear(vm.year?.toString() || '')
      } else if (editAsset.category === 'pension') {
        const pm = m as PensionMetadata
        setPensionType(pm.pensionType || '')
        setPensionManager(pm.manager || '')
        setMonthlyContribution(pm.monthlyContribution?.toString() || '')
      } else if (editAsset.category === 'debt') {
        const dm = m as DebtMetadata
        setDebtType(dm.debtType || '')
        setDebtInterestRate(dm.interestRate?.toString() || '')
        setMonthlyPayment(dm.monthlyPayment?.toString() || '')
        setDueDate(dm.dueDate || '')
      }
    } else {
      // Reset all for new asset
      setCategory('cash'); setName(''); setValue(''); setSymbol(''); setNotes('')
      setAccountType(''); setInterestRate('')
      setQuantity(''); setPricePerUnit(''); setPurchasePrice(''); setWallet('')
      setAssetType(''); setIdentifierType('ticker'); setResolvedTicker('')
      setPropertyType(''); setRePurchasePrice(''); setMonthlyRent('')
      setVehicleType(''); setVehicleYear('')
      setPensionType(''); setPensionManager(''); setMonthlyContribution('')
      setDebtType(''); setDebtInterestRate(''); setMonthlyPayment(''); setDueDate('')
    }
    setErrors({})
  }, [isOpen, editAsset])

  function buildMetadata() {
    switch (category) {
      case 'cash': {
        const m: CashMetadata = {}
        if (accountType) m.accountType = accountType as CashMetadata['accountType']
        if (interestRate) m.interestRate = parseFloat(interestRate.replace(',', '.'))
        return Object.keys(m).length ? m : undefined
      }
      case 'stocks': {
        const m: StocksMetadata = {}
        if (assetType) m.assetType = assetType as StocksMetadata['assetType']
        m.identifierType = identifierType
        if (resolvedTicker) m.resolvedTicker = resolvedTicker
        if (quantity) m.quantity = parseFloat(quantity.replace(',', '.'))
        if (pricePerUnit) m.pricePerUnit = parseFloat(pricePerUnit.replace(',', '.'))
        if (purchasePrice) m.purchasePrice = parseFloat(purchasePrice.replace(',', '.'))
        // Mark unlisted funds as non-auto-updatable
        if (assetType === 'fondo_activo' && !symbol.trim()) m.canAutoUpdate = false
        return Object.keys(m).length ? m : undefined
      }
      case 'crypto': {
        const m: CryptoMetadata = {}
        if (quantity) m.quantity = parseFloat(quantity.replace(',', '.'))
        if (pricePerUnit) m.pricePerUnit = parseFloat(pricePerUnit.replace(',', '.'))
        if (purchasePrice) m.purchasePrice = parseFloat(purchasePrice.replace(',', '.'))
        if (wallet) m.wallet = wallet.trim()
        return Object.keys(m).length ? m : undefined
      }
      case 'real_estate': {
        const m: RealEstateMetadata = {}
        if (propertyType) m.propertyType = propertyType as RealEstateMetadata['propertyType']
        if (rePurchasePrice) m.purchasePrice = parseFloat(rePurchasePrice.replace(',', '.'))
        if (monthlyRent) m.monthlyRent = parseFloat(monthlyRent.replace(',', '.'))
        return Object.keys(m).length ? m : undefined
      }
      case 'vehicles': {
        const m: VehicleMetadata = {}
        if (vehicleType) m.vehicleType = vehicleType as VehicleMetadata['vehicleType']
        if (vehicleYear) m.year = parseInt(vehicleYear)
        return Object.keys(m).length ? m : undefined
      }
      case 'pension': {
        const m: PensionMetadata = {}
        if (pensionType) m.pensionType = pensionType as PensionMetadata['pensionType']
        if (pensionManager) m.manager = pensionManager.trim()
        if (monthlyContribution) m.monthlyContribution = parseFloat(monthlyContribution.replace(',', '.'))
        return Object.keys(m).length ? m : undefined
      }
      case 'debt': {
        const m: DebtMetadata = {}
        if (debtType) m.debtType = debtType as DebtMetadata['debtType']
        if (debtInterestRate) m.interestRate = parseFloat(debtInterestRate.replace(',', '.'))
        if (monthlyPayment) m.monthlyPayment = parseFloat(monthlyPayment.replace(',', '.'))
        if (dueDate) m.dueDate = dueDate
        return Object.keys(m).length ? m : undefined
      }
      default: return undefined
    }
  }

  function getFinalValue(): number {
    // For stocks/crypto: prefer computed (quantity × price), fall back to manual value
    if (category === 'stocks' || category === 'crypto') {
      if (computed !== null) return computed
    }
    return parseFloat(value.replace(',', '.'))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'El nombre es obligatorio'

    if (category === 'stocks' || category === 'crypto') {
      const q = parseFloat(quantity.replace(',', '.'))
      const p = parseFloat(pricePerUnit.replace(',', '.'))
      const hasQuantityAndPrice = !isNaN(q) && !isNaN(p) && q > 0 && p > 0
      const hasManualValue = !isNaN(parseFloat(value.replace(',', '.'))) && parseFloat(value.replace(',', '.')) >= 0
      if (!hasQuantityAndPrice && !hasManualValue) {
        e.value = 'Introduce la cantidad y el precio, o el valor total manualmente'
      }
    } else {
      const num = parseFloat(value.replace(',', '.'))
      if (isNaN(num) || num < 0) e.value = 'Introduce un valor válido (mayor o igual a 0)'
    }
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const finalValue = getFinalValue()
    const metadata = buildMetadata()

    // Update pricePerUnit in metadata if computed
    let enrichedMetadata = metadata
    if (computed !== null && (category === 'stocks' || category === 'crypto')) {
      const p = parseFloat(pricePerUnit.replace(',', '.'))
      if (!isNaN(p)) {
        enrichedMetadata = { ...metadata, pricePerUnit: p }
      }
    }

    onSave({
      category,
      name: name.trim(),
      value: finalValue,
      symbol: symbol.trim() || undefined,
      notes: notes.trim() || undefined,
      metadata: enrichedMetadata,
    })
  }

  const isDebt = category === 'debt'

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={editAsset ? 'Editar' : 'Añadir activo'}
    >
      <form onSubmit={handleSubmit} className="space-y-5 mt-2">

        {/* Category selector */}
        <Field label="Tipo">
          <SelectInput value={category} onChange={v => setCategory(v as AssetCategory)}>
            {CATEGORY_ORDER.map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </SelectInput>
        </Field>

        {/* Name */}
        <Field label="Nombre" error={errors.name}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={
              category === 'debt' ? 'Ej: Hipoteca BBVA, préstamo coche...' :
              category === 'stocks' ? 'Ej: Vanguard S&P 500, AAPL...' :
              category === 'crypto' ? 'Ej: Bitcoin, Ethereum...' :
              category === 'real_estate' ? 'Ej: Piso Madrid, Local Valencia...' :
              category === 'vehicles' ? 'Ej: Toyota Corolla 2020...' :
              category === 'pension' ? 'Ej: Plan Indexa Capital...' :
              'Ej: Cuenta BBVA, Cuenta Trade Republic...'
            }
            className={inputClass(!!errors.name)}
          />
        </Field>

        {/* ===== CASH FIELDS ===== */}
        {category === 'cash' && (
          <>
            <Field label="Tipo de cuenta">
              <SelectInput value={accountType} onChange={setAccountType}>
                <option value="">Sin especificar</option>
                <option value="corriente">Cuenta corriente</option>
                <option value="ahorro">Cuenta de ahorro</option>
                <option value="remunerada">Cuenta remunerada</option>
                <option value="nomina">Cuenta nómina</option>
                <option value="otro">Otro</option>
              </SelectInput>
            </Field>
            {accountType === 'remunerada' && (
              <Field label="Interés anual (%)" hint="Ej: 3.5 para una cuenta al 3.5% TAE">
                <input type="number" inputMode="decimal" value={interestRate} onChange={e => setInterestRate(e.target.value)}
                  placeholder="0.00" min="0" step="0.01" className={inputClass()} />
              </Field>
            )}
            <Field label="Saldo actual en €" error={errors.value}>
              <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
            </Field>
          </>
        )}

        {/* ===== STOCKS FIELDS ===== */}
        {category === 'stocks' && (
          <>
            <Field label="Tipo de activo">
              <SelectInput value={assetType} onChange={v => {
                setAssetType(v)
                // Unlisted active funds can't auto-update
                if (v === 'fondo_activo') setIdentifierType('ticker')
              }}>
                <option value="">Sin especificar</option>
                <option value="etf">ETF</option>
                <option value="fondo_indexado">Fondo indexado</option>
                <option value="accion">Acción individual</option>
                <option value="fondo_activo">Fondo de gestión activa</option>
                <option value="otro">Otro</option>
              </SelectInput>
            </Field>

            {/* Identifier type */}
            <Field label="¿Cómo lo identificas?">
              <div className="grid grid-cols-2 gap-2">
                {(['ticker', 'isin'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setIdentifierType(type); setSymbol(''); setResolvedTicker('') }}
                    className={`py-3 rounded-xl font-body font-medium text-label transition-all ${
                      identifierType === type
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-highest text-on-surface/60'
                    }`}
                  >
                    {type === 'ticker' ? 'Ticker' : 'ISIN'}
                  </button>
                ))}
              </div>
            </Field>

            {/* Ticker path */}
            {identifierType === 'ticker' && (
              <Field
                label="Ticker / Símbolo"
                hint={
                  assetType === 'fondo_activo'
                    ? 'Los fondos de gestión activa sin cotización en bolsa no tienen ticker y no pueden actualizarse automáticamente.'
                    : 'Para ETFs europeos añade el mercado: .DE (Xetra) · .L (Londres) · .PA (París) · .MC (Madrid) · .MI (Milán) · .AS (Ámsterdam)'
                }
              >
                <input
                  type="text"
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  placeholder={
                    assetType === 'fondo_activo' ? 'No aplica para fondos no cotizados' :
                    assetType === 'etf' ? 'Ej: VWCE.DE, IWDA.L, VOO' :
                    assetType === 'accion' ? 'Ej: AAPL, SAN.MC, ASML.AS' :
                    'Ej: VOO, VWCE.DE, IWDA.L'
                  }
                  disabled={assetType === 'fondo_activo'}
                  className={inputClass() + ' font-mono uppercase'}
                />
              </Field>
            )}

            {/* ISIN path */}
            {identifierType === 'isin' && (
              <>
                <Field
                  label="ISIN"
                  hint="12 caracteres: código de país + 9 alfanuméricos + dígito de control. Ej: IE00B3XXRP09 (Vanguard S&P 500 UCITS)"
                >
                  <input
                    type="text"
                    value={symbol}
                    onChange={e => {
                      setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))
                      setResolvedTicker('') // clear cache on change
                    }}
                    placeholder="Ej: IE00B3XXRP09"
                    maxLength={12}
                    className={inputClass() + ' font-mono uppercase tracking-wider'}
                  />
                </Field>
                {resolvedTicker && (
                  <div className="bg-primary-container/40 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-label text-on-surface/60 font-body">Ticker resuelto</span>
                    <span className="font-mono font-semibold text-primary text-label">{resolvedTicker}</span>
                  </div>
                )}
              </>
            )}

            {/* Quantity + price */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantidad (participaciones)" error={errors.value}>
                <input type="number" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
              </Field>
              <Field label="Precio actual (€/u)">
                <input type="number" inputMode="decimal" value={pricePerUnit} onChange={e => setPricePerUnit(e.target.value)}
                  placeholder="0.00" min="0" step="any" className={inputClass()} />
              </Field>
            </div>

            {computed !== null ? (
              <div className="bg-primary-container/40 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-label text-on-surface/60 font-body">Valor total calculado</span>
                <span className="font-display font-semibold text-primary">{formatEur(computed)}</span>
              </div>
            ) : (
              <Field
                label="O introduce el valor total en €"
                error={errors.value}
                hint="Si no tienes el precio por unidad, introduce el valor total directamente"
              >
                <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                  placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
              </Field>
            )}

            <Field label="Precio medio de compra (€/u)" hint="Opcional · Para ver tu ganancia o pérdida">
              <input type="number" inputMode="decimal" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                placeholder="0.00" min="0" step="any" className={inputClass()} />
            </Field>
          </>
        )}

        {/* ===== CRYPTO FIELDS ===== */}
        {category === 'crypto' && (
          <>
            <Field label="Símbolo" hint="Soportados: BTC, ETH, SOL, ADA, DOT, AVAX, XRP, DOGE, BNB y más">
              <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="Ej: BTC, ETH, SOL" className={inputClass() + ' font-mono uppercase'} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Cantidad${symbol ? ` (${symbol})` : ''}`} error={errors.value}>
                <input type="number" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="0.00" min="0" step="any" className={inputClass(!!errors.value)} />
              </Field>
              <Field label="Precio actual (€)">
                <input type="number" inputMode="decimal" value={pricePerUnit} onChange={e => setPricePerUnit(e.target.value)}
                  placeholder="0.00" min="0" step="any" className={inputClass()} />
              </Field>
            </div>
            {computed !== null ? (
              <div className="bg-primary-container/40 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-label text-on-surface/60 font-body">Valor total calculado</span>
                <span className="font-display font-semibold text-primary">{formatEur(computed)}</span>
              </div>
            ) : (
              <Field label="O introduce el valor total en €" error={errors.value}
                hint="Si no tienes el precio exacto, introduce el valor total directamente">
                <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                  placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
              </Field>
            )}
            <Field label="Precio de compra (€/u)" hint="Opcional · Para ver tu ganancia o pérdida">
              <input type="number" inputMode="decimal" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                placeholder="0.00" min="0" step="any" className={inputClass()} />
            </Field>
            <Field label="Dónde está guardada" hint="Opcional · Solo para tu referencia">
              <input type="text" value={wallet} onChange={e => setWallet(e.target.value)}
                placeholder="Ej: Binance, Ledger, Coinbase..." className={inputClass()} />
            </Field>
          </>
        )}

        {/* ===== REAL ESTATE FIELDS ===== */}
        {category === 'real_estate' && (
          <>
            <Field label="Tipo de inmueble">
              <SelectInput value={propertyType} onChange={setPropertyType}>
                <option value="">Sin especificar</option>
                <option value="vivienda_habitual">Vivienda habitual</option>
                <option value="alquiler">Piso / casa en alquiler</option>
                <option value="local">Local comercial</option>
                <option value="garaje">Garaje / trastero</option>
                <option value="terreno">Terreno / solar</option>
                <option value="otro">Otro</option>
              </SelectInput>
            </Field>
            <Field label="Valor estimado actual en €" error={errors.value}
              hint="Precio al que podrías venderlo hoy. Actualízalo anualmente.">
              <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
            </Field>
            <Field label="Precio de compra en €" hint="Opcional · Para ver la revalorización">
              <input type="number" inputMode="decimal" value={rePurchasePrice} onChange={e => setRePurchasePrice(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass()} />
            </Field>
            <Field label="Ingresos por alquiler (€/mes)" hint="Opcional · Si el inmueble está alquilado">
              <input type="number" inputMode="decimal" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass()} />
            </Field>
          </>
        )}

        {/* ===== VEHICLE FIELDS ===== */}
        {category === 'vehicles' && (
          <>
            <Field label="Tipo de vehículo">
              <SelectInput value={vehicleType} onChange={setVehicleType}>
                <option value="">Sin especificar</option>
                <option value="coche">Coche</option>
                <option value="moto">Moto</option>
                <option value="furgoneta">Furgoneta</option>
                <option value="otro">Otro</option>
              </SelectInput>
            </Field>
            <Field label="Año de matriculación" hint="Opcional">
              <input type="number" inputMode="numeric" value={vehicleYear} onChange={e => setVehicleYear(e.target.value)}
                placeholder="Ej: 2019" min="1950" max={new Date().getFullYear()} className={inputClass()} />
            </Field>
            <Field label="Valor estimado actual en €" error={errors.value}
              hint="Precio al que podrías venderlo hoy. Deprecia con el tiempo.">
              <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
            </Field>
          </>
        )}

        {/* ===== PENSION FIELDS ===== */}
        {category === 'pension' && (
          <>
            <Field label="Tipo de producto">
              <SelectInput value={pensionType} onChange={setPensionType}>
                <option value="">Sin especificar</option>
                <option value="plan_pensiones">Plan de pensiones</option>
                <option value="pias">PIAS</option>
                <option value="ppa">PPA</option>
                <option value="fondo_empleo">Fondo de empleo</option>
                <option value="otro">Otro</option>
              </SelectInput>
            </Field>
            <Field label="Gestora" hint="Opcional · Ej: Indexa Capital, Finizens, Bestinver...">
              <input type="text" value={pensionManager} onChange={e => setPensionManager(e.target.value)}
                placeholder="Ej: Indexa Capital, Finizens..." className={inputClass()} />
            </Field>
            <Field label="Valor actual en €" error={errors.value}>
              <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
            </Field>
            <Field label="Aportación mensual (€)" hint="Opcional · Informativo">
              <input type="number" inputMode="decimal" value={monthlyContribution} onChange={e => setMonthlyContribution(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass()} />
            </Field>
          </>
        )}

        {/* ===== DEBT FIELDS ===== */}
        {isDebt && (
          <>
            <Field label="Tipo de deuda">
              <SelectInput value={debtType} onChange={setDebtType}>
                <option value="">Sin especificar</option>
                <option value="hipoteca">Hipoteca</option>
                <option value="prestamo_personal">Préstamo personal</option>
                <option value="prestamo_coche">Préstamo coche</option>
                <option value="tarjeta">Tarjeta de crédito</option>
                <option value="estudiante">Préstamo estudiantil</option>
                <option value="otro">Otro</option>
              </SelectInput>
            </Field>
            <Field label="Importe pendiente en €" error={errors.value}
              hint="Capital que aún debes. Se restará de tu patrimonio.">
              <input type="number" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)}
                placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de interés (%)" hint="TIN anual">
                <input type="number" inputMode="decimal" value={debtInterestRate} onChange={e => setDebtInterestRate(e.target.value)}
                  placeholder="0.00" min="0" step="0.01" className={inputClass()} />
              </Field>
              <Field label="Cuota mensual (€)">
                <input type="number" inputMode="decimal" value={monthlyPayment} onChange={e => setMonthlyPayment(e.target.value)}
                  placeholder="0" min="0" step="any" className={inputClass()} />
              </Field>
            </div>
            <Field label="Fecha estimada de fin" hint="Opcional">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className={inputClass()} />
            </Field>
          </>
        )}

        {/* Notes (all categories) */}
        <Field label="Notas" hint="Opcional">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Cualquier detalle adicional..." rows={2}
            className={inputClass() + ' resize-none'} />
        </Field>

        {/* Actions */}
        <div className={`flex gap-3 pt-2 ${editAsset ? 'flex-col' : ''}`}>
          <button type="submit"
            className="flex-1 bg-primary text-on-primary rounded-xl py-4 font-display font-semibold
              text-body transition-all hover:bg-primary-dim active:scale-[0.98]">
            {editAsset ? 'Guardar cambios' : 'Añadir activo'}
          </button>
          {editAsset && onDelete && (
            <button type="button" onClick={onDelete}
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5
                text-error font-body font-medium transition-all
                bg-surface-container-low hover:bg-error/10 active:scale-[0.98]">
              <Trash2 size={16} />
              Eliminar activo
            </button>
          )}
        </div>
      </form>
    </BottomSheet>
  )
}
