import { useState, useEffect, useRef } from 'react'
import { BottomSheet } from './BottomSheet'
import { formatEur } from '../utils/calculations'
import { exportData, importData } from '../utils/dataPortability'
import { migrateData } from '../utils/migrations'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import type { AppData } from '../types'
import type { AuthState } from '../hooks/useAuth'

interface SettingsSheetProps {
  isOpen: boolean
  onClose: () => void
  monthlyExpenses: number
  emergencyTargetMonths?: number
  onSave: (settings: { monthlyExpenses: number; emergencyTargetMonths: number }) => void
  data: AppData
  setData: (value: AppData | ((prev: AppData) => AppData)) => void
  auth: AuthState
}

export function SettingsSheet({
  isOpen,
  onClose,
  monthlyExpenses,
  emergencyTargetMonths,
  onSave,
  data,
  setData,
  auth,
}: SettingsSheetProps) {
  const [value, setValue] = useState('')
  const [months, setMonths] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authBusy, setAuthBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const persistenceStatus = usePersistentStorage()

  useEffect(() => {
    if (isOpen) {
      setValue(monthlyExpenses > 0 ? monthlyExpenses.toString() : '')
      setMonths(emergencyTargetMonths && emergencyTargetMonths > 0 ? String(emergencyTargetMonths) : '6')
      setImportStatus('idle')
      setImportError('')
      auth.clearError()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when sheet opens
  }, [isOpen, monthlyExpenses, emergencyTargetMonths])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(value.replace(',', '.'))
    const m = parseFloat(months.replace(',', '.'))
    onSave({
      monthlyExpenses: isNaN(num) || num < 0 ? 0 : num,
      emergencyTargetMonths: isNaN(m) || m <= 0 ? 6 : m,
    })
    onClose()
  }

  function handleExport() {
    exportData(data)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const confirmed = window.confirm('¿Reemplazar todos los datos actuales?')
    if (!confirmed) return

    try {
      const imported = await importData(file)
      const migrated = migrateData(imported)
      setData(migrated)
      setImportStatus('success')
      setImportError('')
    } catch (err) {
      setImportStatus('error')
      setImportError(err instanceof Error ? err.message : 'Error al importar')
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setAuthBusy(true)
    try {
      if (authMode === 'login') {
        await auth.signIn(email.trim(), password)
      } else {
        await auth.signUp(email.trim(), password)
      }
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Ajustes">
      <form onSubmit={handleSave} className="space-y-6 mt-2">
        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
            Gastos mensuales en €
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Ej: 1500"
            min="0"
            step="any"
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
              font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
              focus:ring-primary/30 transition-all"
          />
          <p className="text-label-sm text-on-surface/50 mt-2 font-body leading-relaxed">
            Incluye alquiler/hipoteca, alimentación, transporte, seguros y todo lo que necesitas
            para vivir.
            {monthlyExpenses > 0 && (
              <span className="block mt-1 text-primary font-medium">
                Actual: {formatEur(monthlyExpenses)}/mes
              </span>
            )}
          </p>
        </div>

        <div>
          <label className="block text-label font-medium text-on-surface/70 mb-2 font-body">
            Meses de emergencia
          </label>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[3, 6, 12].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setMonths(String(n))}
                className={`rounded-xl py-2.5 text-label font-body font-medium ${
                  months === String(n)
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-highest text-on-surface/70'
                }`}
              >
                {n} meses
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={months}
            onChange={e => setMonths(e.target.value)}
            placeholder="6"
            min="1"
            step="1"
            className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3.5
              font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
              focus:ring-primary/30 transition-all"
          />
          <p className="text-label-sm text-on-surface/50 mt-2 font-body leading-relaxed">
            Efectivo que no tocas. El resto, o rinde, o está aparcado por un motivo concreto.
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-primary text-on-primary rounded-xl py-4 font-display font-semibold
            text-body transition-all hover:bg-primary-dim active:scale-[0.98]"
        >
          Guardar
        </button>
      </form>

      {/* Cuenta / Supabase auth */}
      <div className="mt-8 pt-6 border-t border-outline-variant/30">
        <p className="text-label font-semibold text-on-surface/60 font-body uppercase tracking-wide mb-4">
          Cuenta
        </p>

        {!auth.configured ? (
          <p className="text-label text-on-surface/60 font-body leading-relaxed">
            Sincronización en la nube no configurada. Añade{' '}
            <span className="font-mono text-label-sm">VITE_SUPABASE_URL</span> y{' '}
            <span className="font-mono text-label-sm">VITE_SUPABASE_ANON_KEY</span> en el entorno.
          </p>
        ) : auth.user ? (
          <div className="space-y-3">
            <div className="bg-surface-container-low rounded-xl px-4 py-3">
              <p className="text-label font-medium text-on-surface/80 font-body">Sesión activa</p>
              <p className="text-label-sm text-on-surface/50 font-body mt-0.5 break-all">
                {auth.user.email}
              </p>
              <p className="text-label-sm text-primary font-body mt-2">
                Activos y deudas se sincronizan con Supabase. Los inmuebles se quedan solo en este
                dispositivo (Finca gestiona alquileres).
              </p>
            </div>
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="w-full bg-surface-container-low text-on-surface rounded-xl py-3.5 px-4
                font-body font-medium text-body text-left transition-all
                hover:bg-surface-container-highest active:scale-[0.98]"
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <p className="text-label text-on-surface/60 font-body leading-relaxed mb-1">
              Inicia sesión para sincronizar tu patrimonio entre dispositivos (excepto inmuebles).
            </p>
            <div className="flex gap-2 mb-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 rounded-xl py-2 text-label font-medium font-body transition-all ${
                  authMode === 'login'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface/60'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('signup')}
                className={`flex-1 rounded-xl py-2 text-label font-medium font-body transition-all ${
                  authMode === 'signup'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface/60'
                }`}
              >
                Crear cuenta
              </button>
            </div>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3
                font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
                focus:ring-primary/30"
            />
            <input
              type="password"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              required
              minLength={6}
              className="w-full bg-surface-container-highest text-on-surface rounded-xl px-4 py-3
                font-body text-body placeholder:text-on-surface/30 focus:outline-none focus:ring-2
                focus:ring-primary/30"
            />
            {auth.error && (
              <p className="text-label text-error font-body">{auth.error}</p>
            )}
            <button
              type="submit"
              disabled={authBusy || auth.loading}
              className="w-full bg-primary text-on-primary rounded-xl py-3.5 font-display font-semibold
                text-body transition-all hover:bg-primary-dim active:scale-[0.98] disabled:opacity-60"
            >
              {authBusy ? 'Espera…' : authMode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>

      {/* Data portability */}
      <div className="mt-8 pt-6 border-t border-outline-variant/30">
        <p className="text-label font-semibold text-on-surface/60 font-body uppercase tracking-wide mb-4">
          Datos
        </p>

        <div className="mb-4 flex items-center gap-3 bg-surface-container-low rounded-xl px-4 py-3">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              persistenceStatus === 'granted'
                ? 'bg-primary'
                : persistenceStatus === 'denied'
                  ? 'bg-error'
                  : 'bg-outline-variant'
            }`}
          />
          <div>
            <p className="text-label font-medium text-on-surface/80 font-body">
              {persistenceStatus === 'granted' && 'Datos protegidos'}
              {persistenceStatus === 'denied' && 'Datos sin protección extra'}
              {persistenceStatus === 'unsupported' && 'Almacenamiento estándar'}
              {persistenceStatus === 'unknown' && 'Comprobando...'}
            </p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
              {persistenceStatus === 'granted' &&
                'El navegador no borrará tus datos automáticamente'}
              {persistenceStatus === 'denied' &&
                'Exporta regularmente como copia de seguridad'}
              {persistenceStatus === 'unsupported' &&
                'Exporta regularmente como copia de seguridad'}
              {persistenceStatus === 'unknown' &&
                'Solicitando permiso de almacenamiento persistente'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleExport}
            className="w-full bg-surface-container-low text-on-surface rounded-xl py-3.5 px-4
              font-body font-medium text-body text-left transition-all
              hover:bg-surface-container-highest active:scale-[0.98]"
          >
            Exportar datos
          </button>

          <button
            type="button"
            onClick={handleImportClick}
            className="w-full bg-surface-container-low text-on-surface rounded-xl py-3.5 px-4
              font-body font-medium text-body text-left transition-all
              hover:bg-surface-container-highest active:scale-[0.98]"
          >
            Importar datos
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          {importStatus === 'success' && (
            <p className="text-label text-primary font-body font-medium">
              Datos importados correctamente.
            </p>
          )}
          {importStatus === 'error' && (
            <p className="text-label text-error font-body">{importError}</p>
          )}
        </div>
      </div>

      {/* Privacy section */}
      <div className="mt-8 pt-6 border-t border-outline-variant/30 pb-2">
        <p className="text-label font-semibold text-on-surface/60 font-body uppercase tracking-wide mb-4">
          Privacidad
        </p>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-base mt-0.5">
              ☁️
            </span>
            <p className="text-label text-on-surface/70 font-body leading-relaxed">
              <span className="font-semibold text-on-surface">
                Con sesión iniciada, tus datos pueden sincronizarse con Supabase.
              </span>{' '}
              Activos y deudas se guardan en tu cuenta (proyecto Mi Patrimonio). Sin sesión, todo
              permanece solo en este dispositivo. Los inmuebles no se suben a la nube por defecto
              (Finca gestiona alquileres).
            </p>
          </div>

          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-base mt-0.5">
              📡
            </span>
            <p className="text-label text-on-surface/70 font-body leading-relaxed">
              <span className="font-semibold text-on-surface">Sin rastreo ni analítica.</span> No hay
              cookies de seguimiento. Las llamadas externas son precios de mercado (CoinGecko, Yahoo
              Finance) y, si inicias sesión, Supabase Auth + base de datos.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-base mt-0.5">
              💾
            </span>
            <div>
              <p className="text-label text-on-surface/70 font-body leading-relaxed">
                <span className="font-semibold text-on-surface">Cómo persisten tus datos.</span>{' '}
                Gastos mensuales, snapshots y onboarding siguen en{' '}
                <span className="font-mono text-label-sm bg-surface-container-highest px-1 rounded">
                  localStorage
                </span>
                . Con sesión, el patrimonio sincronizable vive también en Supabase.
              </p>
              <ul className="mt-2 space-y-1.5 ml-1">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5 text-xs">✓</span>
                  <span className="text-label-sm text-on-surface/60 font-body">
                    Los datos locales sobreviven al cerrar el navegador
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5 text-xs">✓</span>
                  <span className="text-label-sm text-on-surface/60 font-body">
                    Con cuenta, puedes recuperar activos/deudas en otro dispositivo
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-error mt-0.5 text-xs">✗</span>
                  <span className="text-label-sm text-on-surface/60 font-body">
                    Si borras los datos del sitio sin haber sincronizado, se pierden los locales
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-error mt-0.5 text-xs">✗</span>
                  <span className="text-label-sm text-on-surface/60 font-body">
                    Los inmuebles no se sincronizan con Supabase (quedan solo en local)
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}
