import type { AppData } from '../types'

export function exportData(data: AppData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fym-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        // Basic validation
        if (!parsed || typeof parsed !== 'object') {
          reject(new Error('Archivo inválido'))
          return
        }
        if (!Array.isArray(parsed.assets)) {
          reject(new Error('El archivo no contiene datos de activos válidos'))
          return
        }
        resolve(parsed as AppData)
      } catch {
        reject(new Error('No se pudo leer el archivo'))
      }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsText(file)
  })
}
