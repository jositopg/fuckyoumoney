import { useState, useEffect, useCallback, useRef } from 'react'
import { lazy, Suspense } from 'react'
import { Plus, Settings } from 'lucide-react'
import type { Asset, AppData, StocksMetadata, CryptoMetadata, CommodityMetadata } from './types'
import { CATEGORY_ORDER, POSITION_GROUPS } from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { usePersistentStorage } from './hooks/usePersistentStorage'
import { useAuth } from './hooks/useAuth'
import { NetWorthHero } from './components/NetWorthHero'
import { WealthStatus } from './components/WealthStatus'
import { AllocationPanel } from './components/AllocationPanel'
import { FincaSyncBanner } from './components/FincaSyncBanner'
import { CategorySection } from './components/CategorySection'
import { PriceUpdateBanner } from './components/PriceUpdateBanner'
import { ExportReminderBanner } from './components/ExportReminderBanner'
import { OnboardingScreen } from './components/OnboardingScreen'
import { updateAssetPrices, applyDailyInterest } from './utils/priceUpdater'
import { migrateData } from './utils/migrations'
import { generateId } from './utils/id'
import { takeSnapshot } from './utils/snapshots'
import { exportData } from './utils/dataPortability'
import {
  createCloudAsset,
  deleteCloudAsset,
  getProfileSettings,
  mergeCloudAndLocal,
  migrateLocalToSupabaseIfNeeded,
  pushLocalAssetsToCloud,
  saveProfileSettings,
  updateCloudAsset,
} from './lib/supabaseData'
import { replaceFincaAssets, syncFincaFromApi } from './lib/fincaSync'

const AssetForm = lazy(() => import('./components/AssetForm').then(m => ({ default: m.AssetForm })))
const SettingsSheet = lazy(() =>
  import('./components/SettingsSheet').then(m => ({ default: m.SettingsSheet }))
)
const InsightsSheet = lazy(() =>
  import('./components/InsightsSheet').then(m => ({ default: m.InsightsSheet }))
)


const DEFAULT_DATA: AppData = {
  assets: [],
  monthlyExpenses: 0,
  hasSeenOnboarding: false,
  schema_version: 4,
}

function newAssetId(hasUser: boolean): string {
  if (hasUser && typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return generateId()
}

export default function App() {
  const [data, setData] = useLocalStorage<AppData>('fym_data', DEFAULT_DATA, migrateData)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isInsightsOpen, setIsInsightsOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [showExportReminder, setShowExportReminder] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [fincaBusy, setFincaBusy] = useState(false)
  const [fincaError, setFincaError] = useState<string | null>(null)
  const [fincaSyncedAt, setFincaSyncedAt] = useState<string | null>(null)
  const isOnline = useOnlineStatus()
  const [isUpdating, setIsUpdating] = useState(false)
  const persistenceStatus = usePersistentStorage()
  const auth = useAuth()
  const syncingRef = useRef(false)

  // Load / migrate cloud data when session appears
  useEffect(() => {
    if (!auth.user) {
      setCloudReady(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        syncingRef.current = true
        const { cloudAssets, omittedRealEstate } = await migrateLocalToSupabaseIfNeeded(
          data.assets,
          auth.user!.id
        )
        if (cancelled) return
        let cloudSettings: { monthlyExpenses: number | null; emergencyTargetMonths: number | null } = {
          monthlyExpenses: null,
          emergencyTargetMonths: null,
        }
        try {
          cloudSettings = await getProfileSettings(auth.user!.id)
        } catch {
          cloudSettings = { monthlyExpenses: null, emergencyTargetMonths: null }
        }
        const localForMerge =
          omittedRealEstate.length > 0 ? omittedRealEstate : data.assets
        const { merged, toUpsert } = mergeCloudAndLocal(cloudAssets, localForMerge)
        let assets = merged
        if (toUpsert.length > 0) {
          const pushed = await pushLocalAssetsToCloud(toUpsert, auth.user!.id)
          const pushedByOldId = new Map(toUpsert.map((a, i) => [a.id, pushed[i]]))
          assets = merged.map(a => {
            const next = pushedByOldId.get(a.id)
            return next ?? a
          })
        }
        if (cancelled) return
        setData(prev => {
          const again = mergeCloudAndLocal(assets, prev.assets)
          return {
            ...prev,
            assets: again.merged,
            ...(cloudSettings.monthlyExpenses != null
              ? { monthlyExpenses: cloudSettings.monthlyExpenses }
              : {}),
            ...(cloudSettings.emergencyTargetMonths != null
              ? { emergencyTargetMonths: cloudSettings.emergencyTargetMonths }
              : {}),
          }
        })
        setCloudReady(true)
        setSyncError(null)
      } catch (err) {
        if (!cancelled) {
          setSyncError(err instanceof Error ? err.message : 'Error al sincronizar')
          setCloudReady(false)
        }
      } finally {
        syncingRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
    // Intentionally only re-run when user id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id])

  // Auto price update on mount (client-side only — never writes price_cache)
  const runPriceUpdate = useCallback(
    async (assets: Asset[]) => {
      const updatableAssets = assets.filter(a => {
        if (a.category === 'crypto' || a.category === 'stocks') return !!a.symbol
        if (a.category === 'commodities') {
          const meta = a.metadata as CommodityMetadata | undefined
          return !!meta?.commodityType && meta.commodityType !== 'otro'
        }
        return false
      })
      if (updatableAssets.length === 0) return
      if (!navigator.onLine) return

      setIsUpdating(true)
      try {
        const { values, resolvedTickers } = await updateAssetPrices(assets)
        if (values.size === 0 && resolvedTickers.size === 0) return

        setData(prev => ({
          ...prev,
          assets: prev.assets.map(a => {
            const newValue = values.get(a.id)
            const newResolvedTicker = resolvedTickers.get(a.id)
            if (newValue === undefined && !newResolvedTicker) return a

            let updatedMetadata = a.metadata
            if (a.category === 'stocks' || a.category === 'crypto' || a.category === 'commodities') {
              const meta = a.metadata as StocksMetadata | CryptoMetadata | CommodityMetadata | undefined
              const quantity = meta?.quantity
              const newPricePerUnit =
                quantity && quantity > 0 && newValue !== undefined ? newValue / quantity : undefined
              updatedMetadata = {
                ...meta,
                ...(newPricePerUnit !== undefined && { pricePerUnit: newPricePerUnit }),
                ...(newResolvedTicker && { resolvedTicker: newResolvedTicker }),
              }
            }

            return {
              ...a,
              ...(newValue !== undefined && { value: newValue }),
              metadata: updatedMetadata,
              updatedAt: new Date().toISOString(),
            }
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
    setData(prev => {
      const updatedAssets = applyDailyInterest(prev.assets)
      return updatedAssets === prev.assets ? prev : { ...prev, assets: updatedAssets }
    })
    runPriceUpdate(data.assets)
    setData(prev => takeSnapshot(prev))
    if (data.assets.length > 0 && persistenceStatus !== 'granted') {
      const last = data.lastExportReminder ? new Date(data.lastExportReminder) : null
      const daysSinceLast = last ? (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24) : Infinity
      if (daysSinceLast >= 30) setShowExportReminder(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount

  const assetsByCategory = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = data.assets.filter(a => a.category === cat)
      return acc
    },
    {} as Record<string, Asset[]>
  )

  const hasAnyAssets = data.assets.length > 0
  const hasSymbolAssets = data.assets.some(a => {
    if (a.category === 'crypto' || a.category === 'stocks') return !!a.symbol
    if (a.category === 'commodities') {
      const meta = a.metadata as CommodityMetadata | undefined
      return !!meta?.commodityType && meta.commodityType !== 'otro'
    }
    return false
  })

  async function handleSaveAsset(assetData: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) {
    const loggedIn = Boolean(auth.user)

    if (editAsset) {
      const updated: Asset = {
        ...editAsset,
        ...assetData,
        updatedAt: new Date().toISOString(),
      }

      if (editAsset.readOnly || editAsset.source === 'finca') {
        setEditAsset(null)
        return
      }

      if (loggedIn && !updated.readOnly) {
        try {
          const saved = await updateCloudAsset(updated, auth.user!.id)
          setData(prev => ({
            ...prev,
            assets: prev.assets.map(a => (a.id === editAsset.id ? saved : a)),
          }))
          setSyncError(null)
        } catch (err) {
          setSyncError(err instanceof Error ? err.message : 'Error al guardar en la nube')
          setData(prev => ({
            ...prev,
            assets: prev.assets.map(a => (a.id === editAsset.id ? updated : a)),
          }))
        }
      } else {
        setData(prev => ({
          ...prev,
          assets: prev.assets.map(a => (a.id === editAsset.id ? updated : a)),
        }))
      }
      setEditAsset(null)
      return
    }

    const now = new Date().toISOString()
    const newAsset: Asset = {
      id: newAssetId(loggedIn),
      ...assetData,
      createdAt: now,
      updatedAt: now,
    }

    if (loggedIn) {
      try {
        const saved = await createCloudAsset(newAsset, auth.user!.id)
        setData(prev => ({ ...prev, assets: [...prev.assets, saved] }))
        setSyncError(null)
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Error al crear en la nube')
        setData(prev => ({ ...prev, assets: [...prev.assets, newAsset] }))
      }
    } else {
      setData(prev => ({ ...prev, assets: [...prev.assets, newAsset] }))
    }
    setIsAddOpen(false)
  }

  async function handleDeleteAsset() {
    if (!editAsset) return
    const target = editAsset
    const loggedIn = Boolean(auth.user)

    if (target.readOnly || target.source === 'finca') {
      setEditAsset(null)
      return
    }

    if (loggedIn) {
      try {
        await deleteCloudAsset(target, auth.user!.id)
        setSyncError(null)
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Error al borrar en la nube')
      }
    }

    setData(prev => ({
      ...prev,
      assets: prev.assets.filter(a => a.id !== target.id),
    }))
    setEditAsset(null)
  }

  async function handleSaveSettings(settings: {
    monthlyExpenses: number
    emergencyTargetMonths: number
  }) {
    setData(prev => ({
      ...prev,
      monthlyExpenses: settings.monthlyExpenses,
      emergencyTargetMonths: settings.emergencyTargetMonths,
    }))
    if (auth.user) {
      try {
        await saveProfileSettings(auth.user.id, settings)
      } catch {
        // Column may not exist yet — localStorage remains source of truth
      }
    }
  }

  function handleExportReminder() {
    exportData(data)
    dismissExportReminder()
  }

  function dismissExportReminder() {
    setShowExportReminder(false)
    setData(prev => ({ ...prev, lastExportReminder: new Date().toISOString() }))
  }

  function handleOnboardingDone() {
    setData(prev => ({ ...prev, hasSeenOnboarding: true }))
  }

  async function handleSyncFinca() {
    if (!auth.user || !cloudReady) {
      setFincaError('Inicia sesión para sincronizar Finca')
      return
    }
    setFincaBusy(true)
    setFincaError(null)
    try {
      const { assets: fincaAssets } = await syncFincaFromApi()
      setData(prev => ({ ...prev, assets: replaceFincaAssets(prev.assets, fincaAssets) }))
      setFincaSyncedAt(new Date().toISOString())
      setSyncError(null)
    } catch (err) {
      setFincaError(err instanceof Error ? err.message : 'Error al sincronizar Finca')
    } finally {
      setFincaBusy(false)
    }
  }

  useEffect(() => {
    if (!auth.user || !cloudReady) return
    void handleSyncFinca()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, cloudReady])

  if (!data.hasSeenOnboarding) {
    return <OnboardingScreen onStart={handleOnboardingDone} />
  }

  function openEdit(asset: Asset) {
    setEditAsset(asset)
  }

  function closeEdit() {
    setEditAsset(null)
  }

  return (
    <div className="min-h-dvh bg-surface font-body text-on-surface">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-sm px-5 py-3 flex items-center justify-between">
        <span className="text-label font-display font-semibold text-on-surface/40 tracking-tight">
          Patrimonio
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

      <main className="px-5 pb-28 max-w-lg mx-auto lg:max-w-3xl">
        {syncError && (
          <div className="mb-3 rounded-xl bg-error/10 text-error px-4 py-3 text-label font-body">
            Sync: {syncError}
          </div>
        )}

        <NetWorthHero assets={data.assets} snapshots={data.snapshots} />

        {hasAnyAssets && (
          <WealthStatus
            assets={data.assets}
            monthlyExpenses={data.monthlyExpenses}
            emergencyTargetMonths={data.emergencyTargetMonths}
            onAsk={q => {
              if (q.id === 'expenses' || q.id === 'emergency_target') setIsSettingsOpen(true)
            }}
          />
        )}

        {hasAnyAssets && <AllocationPanel assets={data.assets} />}

        {auth.user && (
          <FincaSyncBanner
            lastSync={fincaSyncedAt}
            busy={fincaBusy}
            error={fincaError}
            propertyCount={data.assets.filter(a => a.source === 'finca').length}
            onSync={() => void handleSyncFinca()}
          />
        )}

        {hasSymbolAssets && (
          <PriceUpdateBanner
            lastUpdate={data.lastPriceUpdate}
            isOnline={isOnline}
            isUpdating={isUpdating}
          />
        )}

        {showExportReminder && !auth.user && (
          <ExportReminderBanner
            onExport={handleExportReminder}
            onDismiss={dismissExportReminder}
          />
        )}

        {hasAnyAssets ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide">
                Posiciones
              </h2>
              <button
                type="button"
                onClick={() => setIsInsightsOpen(true)}
                className="text-label-sm text-primary font-body font-medium"
              >
                Indicadores
              </button>
            </div>
            <div className="space-y-4">
              {POSITION_GROUPS.map(group => {
                const groupAssets = group.categories.flatMap(cat => assetsByCategory[cat] ?? [])
                if (groupAssets.length === 0) return null
                return group.categories.map(cat => (
                  <CategorySection
                    key={cat}
                    category={cat}
                    assets={assetsByCategory[cat]}
                    onAssetClick={openEdit}
                  />
                ))
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-headline font-display font-semibold text-on-surface mb-2">
              Aún no hay nada
            </h2>
            <p className="text-body text-on-surface/50 font-body max-w-[280px] leading-relaxed">
              Añade cuentas, inversiones o deudas. Los inmuebles llegan de Finca al iniciar sesión.
            </p>
          </div>
        )}
      </main>

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
        <AssetForm
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSave={handleSaveAsset}
        />

        <AssetForm
          isOpen={!!editAsset}
          onClose={closeEdit}
          onSave={handleSaveAsset}
          onDelete={handleDeleteAsset}
          editAsset={editAsset}
        />

        <SettingsSheet
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          monthlyExpenses={data.monthlyExpenses}
          emergencyTargetMonths={data.emergencyTargetMonths}
          onSave={handleSaveSettings}
          data={data}
          setData={setData}
          auth={auth}
        />

        <InsightsSheet
          isOpen={isInsightsOpen}
          onClose={() => setIsInsightsOpen(false)}
          assets={data.assets}
          monthlyExpenses={data.monthlyExpenses}
          snapshots={data.snapshots}
        />
      </Suspense>
    </div>
  )
}
