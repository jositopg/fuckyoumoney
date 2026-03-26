import { useState, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import type { Asset, AssetCategory, StocksMetadata, CryptoMetadata, CashMetadata, RealEstateMetadata, VehicleMetadata, PensionMetadata, DebtMetadata, CommodityMetadata } from '../types'
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

// ── Shared form components ─────────────────────────────────────────────────────

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

// ── Teaching callout ───────────────────────────────────────────────────────────

function TeachingCallout({
  icon,
  title,
  body,
  highlight,
  warn = false,
}: {
  icon: string
  title: string
  body: string
  highlight?: { label: string; value: string }
  warn?: boolean
}) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3 bg-surface-container-low">
      <span className="text-xl mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-label font-semibold text-on-surface font-body mb-1">{title}</p>
        <p className="text-label-sm text-on-surface/55 font-body leading-relaxed">{body}</p>
        {highlight && (
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-label-sm text-on-surface/50 font-body">{highlight.label}</span>
            <span className={`text-label font-semibold font-body tabular-nums ${warn ? 'text-error' : 'text-primary'}`}>
              {highlight.value}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Auto-update info (stocks / crypto) ────────────────────────────────────────
// Shown at the TOP of the section — tells the user exactly what to fill
// before they start. Collapses to a confirmation badge when both fields are set.

function AutoUpdateInfo({
  hasSymbol,
  hasQuantity,
  isCrypto = false,
}: {
  hasSymbol: boolean
  hasQuantity: boolean
  isCrypto?: boolean
}) {
  const isActive = hasSymbol && hasQuantity

  if (isActive) {
    return (
      <div className="bg-primary-container/40 rounded-xl px-4 py-3 flex items-center gap-2.5">
        <span className="text-base flex-shrink-0">🔄</span>
        <p className="text-label font-semibold text-primary font-body">
          Actualización automática activada · {isCrypto ? 'CoinGecko' : 'Yahoo Finance'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-low rounded-xl p-4">
      <p className="text-label font-semibold text-on-surface font-body mb-3">
        🔄 Para que el precio se actualice automáticamente
      </p>
      <div className="space-y-3 mb-3">
        {/* Step 1 */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
            ${hasSymbol ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface/40'}`}>
            {hasSymbol ? '✓' : '1'}
          </div>
          <div>
            <p className="text-label font-semibold text-on-surface font-body">
              {isCrypto ? 'Símbolo de la criptomoneda' : 'Ticker o ISIN del activo'}
            </p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
              {isCrypto
                ? 'Ej: BTC, ETH, SOL, ADA · Identifica la moneda en CoinGecko'
                : 'Ej: VWCE.DE, AAPL, SAN.MC, IE00B3XXRP09 · Identifica el activo en Yahoo Finance'
              }
            </p>
          </div>
        </div>
        {/* Step 2 */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
            ${hasQuantity ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface/40'}`}>
            {hasQuantity ? '✓' : '2'}
          </div>
          <div>
            <p className="text-label font-semibold text-on-surface font-body">
              Cantidad que tienes
            </p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
              Valor total = cantidad × precio de mercado en tiempo real
            </p>
          </div>
        </div>
      </div>
      <p className="text-label-sm text-on-surface/35 font-body border-t border-surface-container-highest pt-2.5 mt-0.5">
        Sin estos dos campos, el precio no se puede actualizar automáticamente.
      </p>
    </div>
  )
}

// ── Main form ──────────────────────────────────────────────────────────────────

export function AssetForm({ isOpen, onClose, onSave, onDelete, editAsset }: AssetFormProps) {
  const [category, setCategory] = useState<AssetCategory>('cash')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [symbol, setSymbol] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Cash
  const [accountType, setAccountType] = useState('')
  const [interestRate, setInterestRate] = useState('')
  // Stocks / Crypto
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
  // Commodities
  const [commodityType, setCommodityType] = useState('')
  const [commodityUnit, setCommodityUnit] = useState<'g' | 'oz' | 'kg'>('g')
  const [commodityQuantity, setCommodityQuantity] = useState('')
  const [commodityPricePerUnit, setCommodityPricePerUnit] = useState('')
  const [commodityPurchasePrice, setCommodityPurchasePrice] = useState('')

  // Computed value for stocks/crypto/commodities
  const computedValue = useCallback(() => {
    if (category === 'stocks' || category === 'crypto') {
      const q = parseFloat(quantity.replace(',', '.'))
      const p = parseFloat(pricePerUnit.replace(',', '.'))
      if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) return q * p
    }
    if (category === 'commodities') {
      const q = parseFloat(commodityQuantity.replace(',', '.'))
      const p = parseFloat(commodityPricePerUnit.replace(',', '.'))
      if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) return q * p
    }
    return null
  }, [category, quantity, pricePerUnit, commodityQuantity, commodityPricePerUnit])

  const computed = computedValue()

  // ── Derived values for teaching callouts ──────────────────────────────────

  const numValue = parseFloat(value.replace(',', '.'))

  // Cash: annual interest earned
  const cashRateNum = parseFloat(interestRate.replace(',', '.'))
  const annualInterestEarned =
    !isNaN(numValue) && !isNaN(cashRateNum) && numValue > 0 && cashRateNum > 0
      ? Math.round(numValue * cashRateNum / 100)
      : null

  // Debt: total interest cost over loan life
  const debtRateNum = parseFloat(debtInterestRate.replace(',', '.'))
  const debtPaymentNum = parseFloat(monthlyPayment.replace(',', '.'))
  const debtTotalInterest = (() => {
    if (isNaN(numValue) || isNaN(debtRateNum) || isNaN(debtPaymentNum)) return null
    if (numValue <= 0 || debtRateNum <= 0 || debtPaymentNum <= 0) return null
    const r = debtRateNum / 100 / 12
    if (debtPaymentNum <= numValue * r) return null // payment doesn't cover interest
    const n = -Math.log(1 - r * numValue / debtPaymentNum) / Math.log(1 + r)
    return Math.round(debtPaymentNum * n - numValue)
  })()

  // Pension: projection at 20 years assuming 6% annual return
  const monthlyContribNum = parseFloat(monthlyContribution.replace(',', '.'))
  const pensionIn20Years = (() => {
    const v = !isNaN(numValue) && numValue > 0 ? numValue : 0
    const m = !isNaN(monthlyContribNum) && monthlyContribNum > 0 ? monthlyContribNum : 0
    if (v === 0 && m === 0) return null
    const r = 0.005 // 6% annual / 12 months
    const n = 240
    return Math.round(v * Math.pow(1 + r, n) + (m > 0 ? m * (Math.pow(1 + r, n) - 1) / r : 0))
  })()

  // Real estate: gross rental yield
  const rentNum = parseFloat(monthlyRent.replace(',', '.'))
  const rentalYieldPct =
    !isNaN(numValue) && !isNaN(rentNum) && numValue > 0 && rentNum > 0
      ? Math.round((rentNum * 12 / numValue) * 100 * 10) / 10
      : null

  // Vehicle: estimated depreciation based on age
  const vehicleAgeYears = vehicleYear ? new Date().getFullYear() - parseInt(vehicleYear) : null
  const vehicleDepreciationPct =
    vehicleAgeYears !== null && vehicleAgeYears > 0
      ? Math.min(Math.round(100 * (1 - Math.pow(0.85, vehicleAgeYears))), 90)
      : null

  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    if (editAsset) {
      setCategory(editAsset.category)
      setName(editAsset.name)
      setValue(editAsset.value.toString())
      setSymbol(editAsset.symbol || '')
      setNotes(editAsset.notes || '')

      const m = editAsset.metadata || {}
      setAccountType(''); setInterestRate('')
      setQuantity(''); setPricePerUnit(''); setPurchasePrice(''); setWallet('')
      setAssetType(''); setPropertyType(''); setRePurchasePrice(''); setMonthlyRent('')
      setVehicleType(''); setVehicleYear('')
      setPensionType(''); setPensionManager(''); setMonthlyContribution('')
      setDebtType(''); setDebtInterestRate(''); setMonthlyPayment(''); setDueDate('')
      setCommodityType(''); setCommodityUnit('g'); setCommodityQuantity(''); setCommodityPricePerUnit(''); setCommodityPurchasePrice('')

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
      } else if (editAsset.category === 'commodities') {
        const cm = m as CommodityMetadata
        setCommodityType(cm.commodityType || '')
        setCommodityUnit(cm.unit || 'g')
        setCommodityQuantity(cm.quantity?.toString() || '')
        setCommodityPricePerUnit(cm.pricePerUnit?.toString() || '')
        setCommodityPurchasePrice(cm.purchasePrice?.toString() || '')
      }
    } else {
      setCategory('cash'); setName(''); setValue(''); setSymbol(''); setNotes('')
      setAccountType(''); setInterestRate('')
      setQuantity(''); setPricePerUnit(''); setPurchasePrice(''); setWallet('')
      setAssetType(''); setIdentifierType('ticker'); setResolvedTicker('')
      setPropertyType(''); setRePurchasePrice(''); setMonthlyRent('')
      setVehicleType(''); setVehicleYear('')
      setPensionType(''); setPensionManager(''); setMonthlyContribution('')
      setDebtType(''); setDebtInterestRate(''); setMonthlyPayment(''); setDueDate('')
      setCommodityType(''); setCommodityUnit('g'); setCommodityQuantity(''); setCommodityPricePerUnit(''); setCommodityPurchasePrice('')
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
      case 'commodities': {
        const m: CommodityMetadata = {}
        if (commodityType) m.commodityType = commodityType as CommodityMetadata['commodityType']
        m.unit = commodityUnit
        if (commodityQuantity) m.quantity = parseFloat(commodityQuantity.replace(',', '.'))
        if (commodityPricePerUnit) m.pricePerUnit = parseFloat(commodityPricePerUnit.replace(',', '.'))
        if (commodityPurchasePrice) m.purchasePrice = parseFloat(commodityPurchasePrice.replace(',', '.'))
        return Object.keys(m).length ? m : undefined
      }
      default: return undefined
    }
  }

  function getFinalValue(): number {
    if (category === 'stocks' || category === 'crypto' || category === 'commodities') {
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
    } else if (category === 'commodities') {
      const q = parseFloat(commodityQuantity.replace(',', '.'))
      const p = parseFloat(commodityPricePerUnit.replace(',', '.'))
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

    let enrichedMetadata = metadata
    if (category === 'stocks' || category === 'crypto') {
      const qNum = parseFloat(quantity.replace(',', '.'))
      const pNum = parseFloat(pricePerUnit.replace(',', '.'))

      if (computed !== null && !isNaN(pNum)) {
        enrichedMetadata = { ...metadata, pricePerUnit: pNum }
      } else if (!isNaN(qNum) && qNum > 0 && !isNaN(finalValue) && finalValue > 0 && (isNaN(pNum) || pNum <= 0)) {
        enrichedMetadata = { ...metadata, pricePerUnit: Math.round((finalValue / qNum) * 10000) / 10000 }
      }
    } else if (category === 'commodities') {
      const qNum = parseFloat(commodityQuantity.replace(',', '.'))
      const pNum = parseFloat(commodityPricePerUnit.replace(',', '.'))
      if (computed !== null && !isNaN(pNum)) {
        enrichedMetadata = { ...metadata, pricePerUnit: pNum }
      } else if (!isNaN(qNum) && qNum > 0 && !isNaN(finalValue) && finalValue > 0 && (isNaN(pNum) || pNum <= 0)) {
        enrichedMetadata = { ...metadata, pricePerUnit: Math.round((finalValue / qNum) * 10000) / 10000 }
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
              category === 'commodities' ? 'Ej: Oro físico, Lingote de plata...' :
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

            {/* Teaching callout per account type */}
            {accountType === 'corriente' && (
              <TeachingCallout
                icon="💳"
                title="La cuenta corriente no es un lugar para ahorrar"
                body="Es para operar, no para acumular. El dinero aquí pierde valor silenciosamente con la inflación. Guarda solo lo que vayas a necesitar este mes — el resto, ponlo a trabajar."
              />
            )}
            {accountType === 'ahorro' && (
              <TeachingCallout
                icon="🛡️"
                title="El primer paso: el colchón de emergencia"
                body="Usa esta cuenta para tener entre 3 y 6 meses de gastos accesibles. No es rentable — no tiene que serlo. Su función es protegerte de tomar malas decisiones cuando la vida se complica. Lo que supere ese colchón, invierte."
              />
            )}
            {accountType === 'remunerada' && (
              <TeachingCallout
                icon="📊"
                title="Buena opción para el colchón, no para acumular"
                body="Una cuenta remunerada es mejor que el colchón sin intereses, pero no es una inversión. Úsala para el fondo de emergencia y para dinero que puedas necesitar pronto. Lo que no vayas a tocar en 5 años, debería estar invertido."
                highlight={annualInterestEarned !== null ? {
                  label: `Con este saldo al ${cashRateNum}% TAE, generas ~`,
                  value: `${formatEur(annualInterestEarned)}/año`,
                } : undefined}
              />
            )}
            {accountType === 'nomina' && (
              <TeachingCallout
                icon="💼"
                title="La cuenta nómina: práctica, pero no productiva"
                body="Domicilia lo justo para cubrir gastos del mes. El dinero que supere tu colchón de emergencia no debería quedarse aquí — muévelo a donde pueda crecer."
              />
            )}
            {!accountType && (
              <TeachingCallout
                icon="💵"
                title="El efectivo es liquidez, no riqueza"
                body="Mantén en efectivo solo lo necesario: el día a día más tu colchón de emergencia (3-6 meses de gastos). El resto debería estar en activos que produzcan."
              />
            )}

            {(accountType === 'remunerada' || accountType === 'ahorro') && (
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

            {/* Teaching callout per stock type */}
            {(assetType === 'etf' || assetType === 'fondo_indexado') && (
              <TeachingCallout
                icon="📈"
                title="La opción más inteligente para la mayoría"
                body="Los fondos indexados y ETFs replican el mercado entero sin apostar por nadie. Sin gestores que fallen, con comisiones mínimas. El 80% de los fondos activos no los baten a 10 años. El tiempo es tu principal ventaja."
              />
            )}
            {assetType === 'accion' && (
              <TeachingCallout
                icon="🎯"
                title="Apostar por una empresa es concentrar el riesgo"
                body="Una acción individual es una apuesta por ese equipo directivo, ese sector y esa economía. Ninguna posición individual debería superar el 10% de tu cartera — si esa empresa quiebra, esa parte desaparece. Diversifica."
              />
            )}
            {assetType === 'fondo_activo' && (
              <TeachingCallout
                icon="⚠️"
                title="Ojo con las comisiones de los fondos activos"
                body="El 80% de los fondos activos no baten al índice a 10 años. Una comisión del 1.5% anual parece pequeña, pero en 20 años puede costarte el equivalente a varios años de rentabilidad. Compara siempre el TER con un fondo indexado equivalente."
              />
            )}
            {!assetType && (
              <TeachingCallout
                icon="📊"
                title="Invierte solo lo que no vas a necesitar pronto"
                body="La bolsa a corto plazo es impredecible. A largo plazo, históricamente recompensa la paciencia. Regla básica: dinero invertido en renta variable = dinero que no necesitas en los próximos 5 años."
              />
            )}

            {/* Auto-update requirements — shown before the fields so user knows upfront */}
            {assetType !== 'fondo_activo' && (
              <AutoUpdateInfo
                hasSymbol={!!(symbol.trim())}
                hasQuantity={!!(quantity) && parseFloat(quantity) > 0}
              />
            )}
            {assetType === 'fondo_activo' && (
              <div className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center gap-2.5">
                <span className="text-base flex-shrink-0">⚙️</span>
                <p className="text-label-sm text-on-surface/60 font-body">
                  Los fondos de gestión activa no cotizan en bolsa — el precio no se puede actualizar automáticamente. Actualiza el valor manualmente.
                </p>
              </div>
            )}

            {/* Identifier type + ticker/ISIN — only for non fondo_activo */}
            {assetType !== 'fondo_activo' && (
              <>
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

                {identifierType === 'ticker' && (
                  <Field
                    label="Ticker / Símbolo"
                    hint="Para ETFs europeos añade el sufijo del mercado: .DE (Xetra) · .L (Londres) · .PA (París) · .MC (Madrid) · .MI (Milán) · .AS (Ámsterdam)"
                  >
                    <input
                      type="text"
                      value={symbol}
                      onChange={e => setSymbol(e.target.value.toUpperCase())}
                      placeholder={
                        assetType === 'etf' ? 'Ej: VWCE.DE, IWDA.L, VOO' :
                        assetType === 'accion' ? 'Ej: AAPL, SAN.MC, ASML.AS' :
                        'Ej: VOO, VWCE.DE, IWDA.L'
                      }
                      className={inputClass() + ' font-mono uppercase'}
                    />
                  </Field>
                )}

                {identifierType === 'isin' && (
                  <>
                    <Field
                      label="ISIN"
                      hint="12 caracteres alfanuméricos. Ej: IE00B3XXRP09 · Se resolverá automáticamente a ticker para actualizar el precio"
                    >
                      <input
                        type="text"
                        value={symbol}
                        onChange={e => {
                          setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))
                          setResolvedTicker('')
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
              </>
            )}

            {/* Quantity + price */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantidad (participaciones)" error={errors.value}>
                <input type="number" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
              </Field>
              <Field label="Precio actual (€/u)" hint="Opcional si introduces el valor total abajo">
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
            <TeachingCallout
              icon="⚡"
              title="Alta rentabilidad, alto riesgo real"
              body="La cripto puede multiplicarse y puede llegar a cero en meses. Regla de oro: nunca más del 5-10% del patrimonio total en cripto. Solo invierte lo que puedas perder sin que cambie tu vida ni tus planes."
            />

            {/* Auto-update requirements — shown before the fields so user knows upfront */}
            <AutoUpdateInfo
              isCrypto
              hasSymbol={!!(symbol.trim())}
              hasQuantity={!!(quantity) && parseFloat(quantity) > 0}
            />

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

            {/* Teaching callout per property type */}
            {propertyType === 'vivienda_habitual' && (
              <TeachingCallout
                icon="🏠"
                title="Tu casa no es un activo productivo"
                body="La vivienda habitual no genera ingresos — es un coste fijo que algún día terminas de pagar. No la cuentes como riqueza generadora. Es calidad de vida y estabilidad, que también tiene valor, pero no es lo mismo que un activo que trabaja para ti."
              />
            )}
            {propertyType === 'alquiler' && (
              <TeachingCallout
                icon="🏢"
                title="El inmueble en alquiler: activo productivo si sale bien"
                body="La rentabilidad bruta es solo la mitad del cuadro. Descuenta IBI, comunidad de propietarios, seguros, reparaciones y periodos de vacío. El mínimo rentable suele ser un 4-5% neto. Por encima de eso, el inmueble trabaja para ti."
                highlight={rentalYieldPct !== null ? {
                  label: 'Rentabilidad bruta estimada:',
                  value: `${rentalYieldPct}%`,
                } : undefined}
              />
            )}
            {(propertyType === 'local' || propertyType === 'garaje' || propertyType === 'terreno') && (
              <TeachingCallout
                icon="🏗️"
                title="Inmueble no residencial: más rentabilidad, más riesgo de vacío"
                body="Los inmuebles no residenciales pueden generar más rendimiento que la vivienda, pero también tienen periodos de vacío más largos y son más difíciles de vender. Son activos de largo plazo: no esperes liquidez rápida si necesitas el dinero."
              />
            )}
            {!propertyType && (
              <TeachingCallout
                icon="🏗️"
                title="El inmueble: valor sólido, liquidez baja"
                body="Un piso no se convierte en efectivo en 48 horas. Tiene valor, pero es un activo ilíquido. Mantén siempre una parte del patrimonio en activos que puedas acceder rápidamente ante una emergencia."
              />
            )}

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

            {/* Teaching callout — dynamic if year is known */}
            {vehicleDepreciationPct !== null ? (
              <TeachingCallout
                icon="📉"
                title="Un vehículo no es una inversión — es una herramienta"
                body={`Con ${vehicleAgeYears} año${vehicleAgeYears !== 1 ? 's' : ''} de antigüedad, un vehículo ha perdido de media entre un ${vehicleDepreciationPct - 5}% y un ${vehicleDepreciationPct + 5}% de su valor original. Seguirá perdiendo cada año. Cómpralo por necesidad, mantenlo el tiempo suficiente para amortizarlo, y no lo cuentes como activo revalorizable.`}
                highlight={{
                  label: 'Depreciación estimada acumulada:',
                  value: `~${vehicleDepreciationPct}%`,
                }}
                warn
              />
            ) : (
              <TeachingCallout
                icon="📉"
                title="Un vehículo no es una inversión — es una herramienta"
                body="Un coche nuevo pierde entre el 15% y el 25% de su valor el primer año. Seguros, combustible, mantenimiento, depreciación — todo suma. Cómpralo por necesidad, no por aspiración, y no lo cuentes como un activo que crece."
              />
            )}

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

            <TeachingCallout
              icon="🌱"
              title="El activo más potente a largo plazo: el tiempo"
              body="Los planes de pensiones tienen ventajas fiscales reales, pero la liquidez es casi nula hasta la jubilación. Su poder está en el interés compuesto a décadas: pequeñas aportaciones regulares producen resultados que parecen imposibles. Empieza cuanto antes, aunque sea poco."
              highlight={pensionIn20Years !== null ? {
                label: 'Estimación en 20 años al 6% anual:',
                value: formatEur(pensionIn20Years, true),
              } : undefined}
            />

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

            {/* Teaching callout per debt type */}
            {debtType === 'hipoteca' && (
              <TeachingCallout
                icon="🏦"
                title="La hipoteca: la deuda más barata que existe"
                body="Es deuda cara, pero es la más barata del mercado. Acepta si la cuota mensual total no supera el 30% de tus ingresos netos. Y recuerda: amortizar hipoteca anticipadamente tiene un rendimiento garantizado equivalente al tipo de interés que pagas."
                highlight={debtTotalInterest !== null ? {
                  label: 'Pagarás en intereses en total:',
                  value: `~${formatEur(debtTotalInterest)}`,
                } : undefined}
              />
            )}
            {(debtType === 'prestamo_personal') && (
              <TeachingCallout
                icon="⚠️"
                title="Deuda cara: liquidar antes de invertir"
                body="Un préstamo personal al 6-10% tiene un coste de oportunidad alto. Cualquier inversión necesita batir ese rendimiento para tener sentido. La deuda al consumo rara vez financia activos que generen más de lo que cobran."
                highlight={debtTotalInterest !== null ? {
                  label: 'Intereses totales estimados:',
                  value: `~${formatEur(debtTotalInterest)}`,
                } : undefined}
                warn
              />
            )}
            {debtType === 'prestamo_coche' && (
              <TeachingCallout
                icon="🚗"
                title="Financiar lo que se deprecia: la combinación más costosa"
                body="Pagas intereses por algo que cada año vale menos. Si tienes capacidad de ahorro, ahorra primero y compra al contado — ahorrarás los intereses del préstamo y negociarás mejor el precio. Si necesitas financiación, elige el plazo más corto posible."
                highlight={debtTotalInterest !== null ? {
                  label: 'Intereses totales estimados:',
                  value: `~${formatEur(debtTotalInterest)}`,
                } : undefined}
                warn
              />
            )}
            {debtType === 'tarjeta' && (
              <TeachingCallout
                icon="🔴"
                title="La trampa financiera más común: la tarjeta con intereses"
                body="Un 18-25% TAE convierte 1.000€ en 2.000€ de deuda real en poco tiempo. Si tienes saldo con intereses en una tarjeta, liquídala antes que cualquier otra cosa — es la deuda más cara del mercado. Las tarjetas son herramientas útiles si se pagan íntegramente cada mes."
                warn
              />
            )}
            {debtType === 'estudiante' && (
              <TeachingCallout
                icon="🎓"
                title="¿Inversión o gasto? Depende del retorno real"
                body="El préstamo de estudios puede ser una inversión si incrementa tu capacidad de generar ingresos de forma significativa. Evalúa el ROI real: ¿cuántos años tardarás en recuperar el coste con la mejora salarial que esperas? Si la respuesta es incierta, es un gasto financiado."
              />
            )}
            {debtType === 'otro' && (
              <TeachingCallout
                icon="💡"
                title="Toda deuda tiene un coste real"
                body="Compara siempre el tipo de interés con lo que podrías ganar invirtiendo ese dinero. La deuda solo sale rentable cuando el activo que financia produce más de lo que cobra en intereses. Si no financia un activo productivo, es riqueza que cedes."
                highlight={debtTotalInterest !== null ? {
                  label: 'Intereses totales estimados:',
                  value: `~${formatEur(debtTotalInterest)}`,
                } : undefined}
                warn
              />
            )}
            {!debtType && (
              <TeachingCallout
                icon="⚖️"
                title="Deuda buena vs deuda mala"
                body="No toda deuda es igual. La deuda buena financia un activo que genera más de lo que cuesta en intereses. La deuda mala financia consumo o activos que se deprecian. Pregúntate siempre: ¿esto pone dinero en mi bolsillo o me lo quita?"
              />
            )}

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

        {/* ===== COMMODITIES FIELDS ===== */}
        {category === 'commodities' && (
          <>
            <Field label="Tipo de metal">
              <SelectInput value={commodityType} onChange={setCommodityType}>
                <option value="">Sin especificar</option>
                <option value="oro">Oro</option>
                <option value="plata">Plata</option>
                <option value="platino">Platino</option>
                <option value="paladio">Paladio</option>
                <option value="otro">Otro metal / materia prima</option>
              </SelectInput>
            </Field>

            <TeachingCallout
              icon="🥇"
              title="Los metales preciosos: reserva de valor, no inversión productiva"
              body="El oro y la plata protegen contra la inflación y las crisis, pero no generan renta. No pagan dividendos ni intereses. Son una forma de preservar valor a largo plazo, no de crearlo. Útiles para diversificar, pero no más del 5-10% del patrimonio total."
            />

            {/* Auto-update info */}
            {commodityType !== 'otro' && (
              <AutoUpdateInfo
                hasSymbol={!!(commodityType && commodityType !== '')}
                hasQuantity={!!(commodityQuantity) && parseFloat(commodityQuantity) > 0}
              />
            )}
            {commodityType === 'otro' && (
              <div className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center gap-2.5">
                <span className="text-base flex-shrink-0">⚙️</span>
                <p className="text-label-sm text-on-surface/60 font-body">
                  Solo actualizamos automáticamente oro (GC=F), plata (SI=F), platino (PL=F) y paladio (PA=F) vía Yahoo Finance. Para otros activos, actualiza el valor manualmente.
                </p>
              </div>
            )}

            <Field label="Unidad de medida">
              <div className="grid grid-cols-3 gap-2">
                {(['g', 'oz', 'kg'] as const).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setCommodityUnit(u)}
                    className={`py-3 rounded-xl font-body font-medium text-label transition-all ${
                      commodityUnit === u
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-highest text-on-surface/60'
                    }`}
                  >
                    {u === 'g' ? 'Gramos' : u === 'oz' ? 'Onzas troy' : 'Kilogramos'}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Cantidad (${commodityUnit})`} error={errors.value}>
                <input type="number" inputMode="decimal" value={commodityQuantity} onChange={e => setCommodityQuantity(e.target.value)}
                  placeholder="0" min="0" step="any" className={inputClass(!!errors.value)} />
              </Field>
              <Field label={`Precio actual (€/${commodityUnit})`} hint="Opcional si introduces el valor total">
                <input type="number" inputMode="decimal" value={commodityPricePerUnit} onChange={e => setCommodityPricePerUnit(e.target.value)}
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

            <Field label={`Precio de compra (€/${commodityUnit})`} hint="Opcional · Para ver tu ganancia o pérdida">
              <input type="number" inputMode="decimal" value={commodityPurchasePrice} onChange={e => setCommodityPurchasePrice(e.target.value)}
                placeholder="0.00" min="0" step="any" className={inputClass()} />
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
