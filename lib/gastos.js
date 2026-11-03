// Gasto mensual real frente al ajuste manual del perfil.
// Sin cifra real vigente, el diagnóstico usa el manual tal cual.

export const DIAS_GASTO_REAL = 60
const MS_DIA = 24 * 60 * 60 * 1000

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

export function redondearEuros(n) {
  return Math.round(n * 100) / 100
}

function filaDe(reales) {
  if (!reales || typeof reales !== 'object' || Array.isArray(reales)) return null
  return reales
}

function tieneCifra(reales) {
  const fila = filaDe(reales)
  if (!fila) return false
  const media = numero(fila.mediaMensual)
  if (media == null || media <= 0) return false
  return Number.isFinite(Date.parse(fila.actualizado))
}

/** Cifra usable: media positiva y actualizado con menos de 60 días. */
export function realesVigentes(reales, ahora) {
  if (!tieneCifra(reales)) return false
  const edad = Date.parse(ahora) - Date.parse(reales.actualizado)
  if (!Number.isFinite(edad)) return false
  return edad < DIAS_GASTO_REAL * MS_DIA
}

function textoONull(valor) {
  return typeof valor === 'string' && valor ? valor : null
}

/**
 * El importe que usa el diagnóstico.
 * Con dato real vigente gana la media. Si no, el manual, sin redondearlo.
 */
export function gastoEfectivo(manual, reales, ahora) {
  const manualNumero = numero(manual) ?? 0
  const vigente = realesVigentes(reales, ahora)
  const fila = filaDe(reales)
  return {
    importe: vigente ? redondearEuros(Number(fila.mediaMensual)) : manualNumero,
    origen: vigente ? 'real' : 'manual',
    manual: manualNumero,
    actualizado: textoONull(fila?.actualizado),
    hasta: textoONull(fila?.hasta),
    fuente: textoONull(fila?.fuente),
    meses: fila && numero(fila.meses) != null ? numero(fila.meses) : null,
    caducado: !vigente && tieneCifra(fila),
  }
}

export function importeEuro(raw, clave) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw < 0) throw new Error(`"${clave}" tiene que ser un importe en euros, cero o más.`)
    return redondearEuros(raw)
  }
  if (typeof raw !== 'string') throw new Error(`Falta "${clave}".`)
  const s = raw.trim().replace(/€/g, '').trim()
  if (!s) throw new Error(`Falta "${clave}".`)
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${clave}" tiene que ser un importe en euros, cero o más.`)
  return redondearEuros(n)
}

function mesesDe(raw) {
  if (raw == null || raw === '') throw new Error('Falta "meses".')
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  if (!Number.isInteger(n) || n < 3 || n > 24) {
    throw new Error('"meses" tiene que ser un entero entre 3 y 24.')
  }
  return n
}

function fuenteDe(raw) {
  if (typeof raw !== 'string') throw new Error('"fuente" tiene que ser un texto de 1 a 80 caracteres.')
  const fuente = raw.replace(/\s+/g, ' ').trim()
  if (!fuente || fuente.length > 80) {
    throw new Error('"fuente" tiene que ser un texto de 1 a 80 caracteres.')
  }
  return fuente
}

function hastaDe(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('"hasta" tiene que ser una fecha real con la forma AAAA-MM-DD.')
  }
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error('"hasta" tiene que ser una fecha real con la forma AAAA-MM-DD.')
  }
  return raw
}

function desgloseDe(raw) {
  if (raw == null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('"desglose" tiene que ser un objeto por categoría.')
  }
  const claves = Object.keys(raw)
  if (claves.length > 30) throw new Error('"desglose" admite hasta 30 categorías.')
  const salida = {}
  for (const clave of claves) {
    const nombre = clave.trim()
    if (!nombre || nombre.length > 40) {
      throw new Error('Cada categoría del desglose tiene que ser un texto de 1 a 40 caracteres.')
    }
    salida[nombre] = importeEuro(raw[clave], `desglose.${nombre}`)
  }
  return claves.length ? salida : undefined
}

/** Objeto que se guarda en el perfil. actualizado lo pone el servidor. */
export function prepararGastosReales(datos, actualizado) {
  if (datos == null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new Error('Los argumentos tienen que ser un objeto.')
  }
  if (datos.mediaMensual == null || datos.mediaMensual === '') throw new Error('Falta "mediaMensual".')
  const mediaMensual = importeEuro(datos.mediaMensual, 'mediaMensual')
  if (mediaMensual <= 0) throw new Error('"mediaMensual" tiene que ser mayor que cero.')
  const meses = mesesDe(datos.meses)
  const fuente = fuenteDe(datos.fuente)
  const hasta = hastaDe(datos.hasta)
  if (typeof actualizado !== 'string' || !Number.isFinite(Date.parse(actualizado))) {
    throw new Error('Falta la fecha de actualización.')
  }
  const desglose = desgloseDe(datos.desglose)
  const registro = { mediaMensual, meses, fuente, hasta, actualizado }
  if (desglose) registro.desglose = desglose
  return registro
}
