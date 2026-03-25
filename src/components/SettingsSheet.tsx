import { useState, useEffect, useRef } from 'react'
import { BottomSheet } from './BottomSheet'
import { formatEur } from '../utils/calculations'
import { exportData, importData } from '../utils/dataPortability'
import { migrateData } from '../utils/migrations'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import type { AppData } from '../types'

interface SettingsSheetProps {
  isOpen: boolean
  onClose: () => void
  monthlyExpenses: number
  onSave: (expenses: number) => void
  data: AppData
  setData: (value: AppData | ((prev: AppData) => AppData)) => void
}

export function SettingsSheet({
  isOpen,
  onClose,
  monthlyExpenses,
  onSave,
  data,
  setData,
}: SettingsSheetProps) {
  const [value, setValue] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const persistenceStatus = usePersistentStorage()

  useEffect(() => {
    if (isOpen) {
      setValue(monthlyExpenses > 0 ? monthlyExpenses.toString() : '')
      setImportStatus('idle')
      setImportError('')
    }
  }, [isOpen, monthlyExpenses])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const num = parseFloat(value.replace(',', '.'))
    onSave(isNaN(num) || num < 0 ? 0 : num)
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
    // Reset input so same file can be selected again
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

        <div className="bg-surface-container-low rounded-xl p-4">
          <p className="text-label font-medium text-on-surface/70 font-body mb-1">¿Para qué sirve?</p>
          <p className="text-label text-on-surface/60 font-body leading-relaxed">
            Tus gastos mensuales son la unidad de medida real de tu libertad. Con este dato
            calculamos cuánto tiempo podrías vivir sin depender de ningún ingreso.
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

      {/* Data portability */}
      <div className="mt-8 pt-6 border-t border-outline-variant/30">
        <p className="text-label font-semibold text-on-surface/60 font-body uppercase tracking-wide mb-4">
          Datos
        </p>

        {/* Storage persistence status */}
        <div className="mb-4 flex items-center gap-3 bg-surface-container-low rounded-xl px-4 py-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            persistenceStatus === 'granted' ? 'bg-primary' :
            persistenceStatus === 'denied' ? 'bg-error' :
            'bg-outline-variant'
          }`} />
          <div>
            <p className="text-label font-medium text-on-surface/80 font-body">
              {persistenceStatus === 'granted' && 'Datos protegidos'}
              {persistenceStatus === 'denied' && 'Datos sin protección extra'}
              {persistenceStatus === 'unsupported' && 'Almacenamiento estándar'}
              {persistenceStatus === 'unknown' && 'Comprobando...'}
            </p>
            <p className="text-label-sm text-on-surface/50 font-body mt-0.5">
              {persistenceStatus === 'granted' && 'El navegador no borrará tus datos automáticamente'}
              {persistenceStatus === 'denied' && 'Exporta regularmente como copia de seguridad'}
              {persistenceStatus === 'unsupported' && 'Exporta regularmente como copia de seguridad'}
              {persistenceStatus === 'unknown' && 'Solicitando permiso de almacenamiento persistente'}
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
            <span aria-hidden="true" className="text-base mt-0.5">🔒</span>
            <p className="text-label text-on-surface/70 font-body leading-relaxed">
              <span className="font-semibold text-on-surface">Ningún dato sale de este dispositivo.</span>{' '}
              No hay servidor, no hay base de datos, no hay cuenta. Esta app no sabe quién eres.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-base mt-0.5">📡</span>
            <p className="text-label text-on-surface/70 font-body leading-relaxed">
              <span className="font-semibold text-on-surface">Sin rastreo ni analítica.</span>{' '}
              No hay cookies de seguimiento ni herramientas de terceros que observen tu actividad.
              Las únicas llamadas externas son las de precios de mercado (CoinGecko, Yahoo Finance).
            </p>
          </div>

          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-base mt-0.5">💾</span>
            <div>
              <p className="text-label text-on-surface/70 font-body leading-relaxed">
                <span className="font-semibold text-on-surface">Cómo persisten tus datos.</span>{' '}
                Todo se guarda en el <span className="font-mono text-label-sm bg-surface-container-highest px-1 rounded">localStorage</span> de este navegador.
              </p>
              <ul className="mt-2 space-y-1.5 ml-1">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5 text-xs">✓</span>
                  <span className="text-label-sm text-on-surface/60 font-body">Los datos sobreviven al cerrar el navegador o la app</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5 text-xs">✓</span>
                  <span className="text-label-sm text-on-surface/60 font-body">
                    {persistenceStatus === 'granted'
                      ? 'Almacenamiento persistente activo — el navegador no los borrará automáticamente'
                      : 'Exporta regularmente para evitar pérdida de datos si el navegador libera espacio'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-error mt-0.5 text-xs">✗</span>
                  <span className="text-label-sm text-on-surface/60 font-body">Si borras los datos del sitio desde el navegador, se pierden</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-error mt-0.5 text-xs">✗</span>
                  <span className="text-label-sm text-on-surface/60 font-body">Los datos no se sincronizan entre dispositivos distintos</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}
