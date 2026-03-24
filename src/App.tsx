import { useState, useEffect, useCallback } from 'react'
import { lazy, Suspense } from 'react'
import { Plus, Settings } from 'lucide-react'
import type { Asset, AppData, StocksMetadata, CryptoMetadata } from './types'
import { CATEGORY_ORDER } from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { AutonomyHero } from './components/AutonomyHero'
import { CategorySection } from './components/CategorySection'
import { MetricsSection } from './components/MetricsSection'
import { PriceUpdateBanner } from './components/PriceUpdateBanner'
import { updateAssetPrices } from './utils/priceUpdater'
import { migrateData } from './utils/migrations'
import { generateId } from './utils/id'
import { takeSnapshot } from './utils/snapshots'

const AssetForm = lazy(() => import('./components/AssetForm').then(m => ({ default: m.AssetForm })))
const SettingsSheet = lazy(() =>
  import('./components/SettingsSheet').then(m => ({ default: m.SettingsSheet }))
)

const DEFAULT_DATA: AppData = {
  assets: [],
  monthlyExpenses: 0,
  schema_version: 2,
}

export default function App() {
  const [data, setData] = useLocalStorage<AppData>('fym_data', DEFAULT_DATA, migrateData)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const isOnline = useOnlineStatus()
  const [isUpdating, setIsUpdating] = useState(false)

  // Auto price update on mount
  const runPriceUpdate = useCallback(
    async (assets: Asset[]) => {
      const updatableAssets = assets.filter(
        a => (a.category === 'crypto' || a.category === 'stocks') && a.symbol
      )
      if (updatableAssets.length === 0) return
      if (!navigator.onLine) return

      setIsUpdating(true)
      try {
        const updates = await updateAssetPrices(assets)
        if (updates.size === 0) return

        setData(prev => ({
          ...prev,
          assets: prev.assets.map(a => {
            const newValue = updates.get(a.id)
            if (newValue === undefined) return a

            // Also update pricePerUnit in metadata
            let updatedMetadata = a.metadata
            if (a.category === 'stocks' || a.category === 'crypto') {
              const meta = a.metadata as StocksMetadata | CryptoMetadata | undefined
              const quantity = meta?.quantity
              const newPricePerUnit = quantity && quantity > 0 ? newValue / quantity : newValue
              updatedMetadata = { ...meta, pricePerUnit: newPricePerUnit }
            }

            return { ...a, value: newValue, metadata: updatedMetadata, updatedAt: new Date().toISOString() }
          }),
          lastPriceUpdate: new Date().toISOString(),
        }))
      } catch {
        // Silent fail — use stored values
      } finally {
        setIsUpdating(false)
      }
    },
    [setData]
  )

  useEffect(() => {
    runPriceUpdate(data.assets)
    // Take monthly snapshot on mount
    setData(prev => takeSnapshot(prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount

  // Group assets by category
  const assetsByCategory = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = data.assets.filter(a => a.category === cat)
      return acc
    },
    {} as Record<string, Asset[]>
  )

  const hasAnyAssets = data.assets.length > 0
  const hasSymbolAssets = data.assets.some(
    a => (a.category === 'crypto' || a.category === 'stocks') && a.symbol
  )

  function handleSaveAsset(assetData: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) {
    if (editAsset) {
      setData(prev => ({
        ...prev,
        assets: prev.assets.map(a =>
          a.id === editAsset.id
            ? { ...a, ...assetData, updatedAt: new Date().toISOString() }
            : a
        ),
      }))
      setEditAsset(null)
    } else {
      const now = new Date().toISOString()
      const newAsset: Asset = {
        id: generateId(),
        ...assetData,
        createdAt: now,
        updatedAt: now,
      }
      setData(prev => ({ ...prev, assets: [...prev.assets, newAsset] }))
      setIsAddOpen(false)
    }
  }

  function handleDeleteAsset() {
    if (!editAsset) return
    setData(prev => ({
      ...prev,
      assets: prev.assets.filter(a => a.id !== editAsset.id),
    }))
    setEditAsset(null)
  }

  function handleSaveSettings(expenses: number) {
    setData(prev => ({ ...prev, monthlyExpenses: expenses }))
  }

  function openEdit(asset: Asset) {
    setEditAsset(asset)
  }

  function closeEdit() {
    setEditAsset(null)
  }

  return (
    <div className="min-h-dvh bg-surface font-body text-on-surface">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm px-5 py-3 flex items-center justify-between">
        <span className="text-label font-display font-semibold text-on-surface/40 tracking-tight">
          F*ck You Money
        </span>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center
            bg-surface-container-low text-on-surface/50
            hover:bg-surface-container-highest hover:text-on-surface transition-all"
          aria-label="Ajustes"
        >
          <Settings size={17} />
        </button>
      </header>

      {/* Main content */}
      <main className="px-5 pb-28 max-w-lg mx-auto">
        {/* Hero */}
        <AutonomyHero
          assets={data.assets}
          monthlyExpenses={data.monthlyExpenses}
          snapshots={data.snapshots}
        />

        {/* Price update banner */}
        {hasSymbolAssets && (
          <PriceUpdateBanner
            lastUpdate={data.lastPriceUpdate}
            isOnline={isOnline}
            isUpdating={isUpdating}
          />
        )}

        {/* Metrics */}
        {hasAnyAssets && (
          <MetricsSection assets={data.assets} monthlyExpenses={data.monthlyExpenses} />
        )}

        {/* Assets by category */}
        {hasAnyAssets ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide">
                Activos
              </h2>
            </div>
            <div className="space-y-4">
              {CATEGORY_ORDER.map(cat => (
                <CategorySection
                  key={cat}
                  category={cat}
                  assets={assetsByCategory[cat]}
                  onAssetClick={openEdit}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-container/40 flex items-center justify-center mb-5 text-2xl">
              💰
            </div>
            <h2 className="text-headline font-display font-semibold text-on-surface mb-2">
              Empieza a construir
            </h2>
            <p className="text-body text-on-surface/50 font-body max-w-[260px] leading-relaxed mb-6">
              Añade tus activos y deudas para ver tu situación real de un vistazo.
            </p>
            {data.monthlyExpenses === 0 && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="text-label font-medium text-primary font-body underline underline-offset-2"
              >
                Primero, configura tus gastos mensuales →
              </button>
            )}
          </div>
        )}
      </main>

      {/* Floating + button */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <button
          onClick={() => setIsAddOpen(true)}
          className="pointer-events-auto w-14 h-14 bg-primary text-on-primary rounded-2xl
            flex items-center justify-center shadow-soft-lg
            hover:bg-primary-dim active:scale-95 transition-all"
          aria-label="Añadir activo"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      </div>

      <Suspense fallback={null}>
        {/* Add asset form */}
        <AssetForm
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSave={handleSaveAsset}
        />

        {/* Edit asset form */}
        <AssetForm
          isOpen={!!editAsset}
          onClose={closeEdit}
          onSave={handleSaveAsset}
          onDelete={handleDeleteAsset}
          editAsset={editAsset}
        />

        {/* Settings */}
        <SettingsSheet
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          monthlyExpenses={data.monthlyExpenses}
          onSave={handleSaveSettings}
          data={data}
          setData={setData}
        />
      </Suspense>
    </div>
  )
}
