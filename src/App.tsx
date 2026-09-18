import { useState, useEffect, useRef } from 'react'
import { lazy, Suspense } from 'react'
import { Plus, Settings } from 'lucide-react'
import type { Asset, AppData } from './types'
import { CATEGORY_ORDER, POSITION_GROUPS, isReadOnlyAsset } from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import { usePersistentStorage } from './hooks/usePersistentStorage'
import { useAuth } from './hooks/useAuth'
import { NetWorthHero } from './components/NetWorthHero'
import { WealthStatus } from './components/WealthStatus'
import { CategorySection } from './components/CategorySection'
import { ExportReminderBanner } from './components/ExportReminderBanner'
import { OnboardingScreen } from './components/OnboardingScreen'
import { largestIdleCash, parkedWithoutReason } from './utils/moneyDiagnosis'
import { isCashStale, setAssetValue } from './utils/declaredValue'
import { migrateData } from './utils/migrations'
import { generateId } from './utils/id'
import { takeSnapshot } from './utils/snapshots'
import { exportData } from './utils/dataPortability'
import {
  createCloudAsset,
  deleteCloudAsset,
  formatCloudError,
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
const UpdateValueSheet = lazy(() =>
  import('./components/UpdateValueSheet').then(m => ({ default: m.UpdateValueSheet }))
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
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [showExportReminder, setShowExportReminder] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [fincaBusy, setFincaBusy] = useState(false)
  const [fincaError, setFincaError] = useState<string | null>(null)
  const [fincaSyncedAt, setFincaSyncedAt] = useState<string | null>(null)
  const [valueIds, setValueIds] = useState<string[]>([])
  const [valueIndex, setValueIndex] = useState(0)
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
          setCloudReady(true)
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

  useEffect(() => {
    if (auth.loading) return
    if (auth.user && !cloudReady) return
    setData(prev => takeSnapshot(prev))
    if (!auth.user && data.assets.length > 0 && persistenceStatus !== 'granted') {
      const last = data.lastExportReminder ? new Date(data.lastExportReminder) : null
      const daysSinceLast = last ? (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24) : Infinity
      if (daysSinceLast >= 30) setShowExportReminder(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.user?.id, cloudReady])

  const assetsByCategory = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = data.assets.filter(a => a.category === cat)
      return acc
    },
    {} as Record<string, Asset[]>
  )

  const hasAnyAssets = data.assets.length > 0
  const valueAsset =
    valueIds.length > 0
      ? (data.assets.find(a => a.id === valueIds[valueIndex]) ?? null)
      : null

  async function persistAsset(updated: Asset) {
    if (isReadOnlyAsset(updated)) return
    if (auth.user) {
      try {
        const saved = await updateCloudAsset(updated, auth.user.id)
        setData(prev => ({
          ...prev,
          assets: prev.assets.map(a => (a.id === updated.id ? saved : a)),
        }))
        setSyncError(null)
      } catch (err) {
        setSyncError(formatCloudError(err))
        setData(prev => ({
          ...prev,
          assets: prev.assets.map(a => (a.id === updated.id ? updated : a)),
        }))
      }
    } else {
      setData(prev => ({
        ...prev,
        assets: prev.assets.map(a => (a.id === updated.id ? updated : a)),
      }))
    }
  }

  function closeValueQueue() {
    setValueIds([])
    setValueIndex(0)
  }

  function advanceValueQueue() {
    if (valueIndex + 1 >= valueIds.length) {
      closeValueQueue()
      return
    }
    setValueIndex(i => i + 1)
  }

  function openValueQueue(assets: Asset[]) {
    const ids = assets.filter(a => !isReadOnlyAsset(a)).map(a => a.id)
    if (ids.length === 0) return
    setValueIds(ids)
    setValueIndex(0)
  }

  async function handleSaveAsset(assetData: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) {
    const loggedIn = Boolean(auth.user)

    if (editAsset) {
      const updated: Asset = {
        ...editAsset,
        ...assetData,
        updatedAt: new Date().toISOString(),
      }

      if (isReadOnlyAsset(editAsset)) {
        setEditAsset(null)
        return
      }

      await persistAsset(updated)
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
        setSyncError(formatCloudError(err))
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

    if (isReadOnlyAsset(target)) {
      setEditAsset(null)
      return
    }

    if (loggedIn) {
      try {
        await deleteCloudAsset(target, auth.user!.id)
        setSyncError(null)
      } catch (err) {
        setSyncError(formatCloudError(err))
        return
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

  function closeEdit() {
    setEditAsset(null)
  }

  function openPosition(asset: Asset) {
    if (isReadOnlyAsset(asset)) {
      setEditAsset(asset)
      return
    }
    openValueQueue([asset])
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
              if (q.id === 'expenses' || q.id === 'emergency_target') {
                setIsSettingsOpen(true)
                return
              }
              if (q.id === 'parked_reason') {
                const parked = parkedWithoutReason(data.assets)[0]
                if (parked) setEditAsset(parked)
                return
              }
              const idle = largestIdleCash(data.assets)
              if (idle) setEditAsset(idle)
            }}
            onMove={m => {
              if (m.stance === 'deploy' || m.stance === 'classify') {
                const idle = largestIdleCash(data.assets)
                if (idle) setEditAsset(idle)
              }
            }}
            onIdleCash={() => {
              const idle = largestIdleCash(data.assets)
              if (idle) setEditAsset(idle)
            }}
          />
        )}

        {fincaError && (
          <div className="mb-3 rounded-xl bg-error/10 text-error px-4 py-3 text-label font-body flex items-center justify-between gap-3">
            <span>Finca: {fincaError}</span>
            <button
              type="button"
              onClick={() => void handleSyncFinca()}
              disabled={fincaBusy}
              className="flex-shrink-0 text-label font-medium underline disabled:opacity-50"
            >
              Reintentar
            </button>
          </div>
        )}

        {showExportReminder && !auth.user && (
          <ExportReminderBanner
            onExport={handleExportReminder}
            onDismiss={dismissExportReminder}
          />
        )}

        {hasAnyAssets ? (
          <div>
            <h2 className="text-label font-semibold text-on-surface/50 font-body uppercase tracking-wide mb-3">
              Posiciones
            </h2>
            <div className="space-y-6">
              {POSITION_GROUPS.map(group => {
                const groupAssets = group.categories.flatMap(cat => assetsByCategory[cat] ?? [])
                if (groupAssets.length === 0) return null
                return (
                  <div key={group.id}>
                    <p className="text-label-sm font-semibold text-on-surface/40 font-body uppercase tracking-wide mb-1">
                      {group.label}
                    </p>
                    {group.categories.map(cat => {
                      const list = assetsByCategory[cat] ?? []
                      const cashStale =
                        cat === 'cash' ? list.filter(a => isCashStale(a)).length : 0
                      return (
                        <CategorySection
                          key={cat}
                          category={cat}
                          assets={list}
                          onAssetClick={openPosition}
                          onReview={
                            cat === 'cash' && list.some(a => !isReadOnlyAsset(a))
                              ? () => openValueQueue(list)
                              : undefined
                          }
                          hint={
                            cashStale > 0
                              ? `${cashStale} sin confirmar en 30 días`
                              : undefined
                          }
                        />
                      )
                    })}
                  </div>
                )
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

        <UpdateValueSheet
          isOpen={valueIds.length > 0 && !!valueAsset}
          asset={valueAsset}
          step={valueIndex + 1}
          total={valueIds.length}
          onClose={closeValueQueue}
          onConfirm={value => {
            if (!valueAsset) return
            void persistAsset(setAssetValue(valueAsset, value)).then(() => advanceValueQueue())
          }}
          onSkip={valueIds.length > 1 ? advanceValueQueue : undefined}
          onEditDetails={() => {
            if (!valueAsset) return
            const target = valueAsset
            closeValueQueue()
            setEditAsset(target)
          }}
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
          finca={
            auth.user
              ? {
                  lastSync: fincaSyncedAt,
                  busy: fincaBusy,
                  error: fincaError,
                  propertyCount: data.assets.filter(a => a.source === 'finca').length,
                  onSync: () => void handleSyncFinca(),
                }
              : undefined
          }
        />
      </Suspense>
    </div>
  )
}
