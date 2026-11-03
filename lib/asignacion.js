// Reparto objetivo del perfil. Sin objetivo válido no hay aviso.
// La deuda no entra en la base. El resto (cripto, pensión, etc.) sí cuenta en el total.

export const TOLERANCIA_DEFECTO = 5

const CLASES = ['inmuebles', 'bolsa', 'liquidez']

const ETIQUETA = {
  inmuebles: 'Inmuebles',
  bolsa: 'Bolsa',
  liquidez: 'Liquidez',
}

const DEUDA = new Set([
  'debt',
  'deuda',
  'mortgage',
  'hipoteca',
  'liability',
  'personal_loan',
  'car_loan',
  'credit_card',
  'student_loan',
])

function redondear(n) {
  return Math.round(n * 100) / 100
}

function eurosTexto(n) {
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.')
  const grupos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${grupos},${decimales} €`
}

function formatoPuntos(n) {
  const [entero, decimales] = redondear(Math.abs(n)).toFixed(2).split('.')
  if (decimales === '00') return entero
  if (decimales.endsWith('0')) return `${entero},${decimales[0]}`
  return `${entero},${decimales}`
}

function entero(raw, clave) {
  if (raw == null || raw === '') throw new Error(`Falta "${clave}".`)
  if (typeof raw === 'boolean') throw new Error(`"${clave}" tiene que ser un entero entre 0 y 100.`)
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new Error(`"${clave}" tiene que ser un entero entre 0 y 100.`)
  }
  return n
}

/** Objeto que se guarda en el perfil. La tolerancia, si no viene, es 5. */
export function prepararAsignacion(datos) {
  if (datos == null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new Error('Los argumentos tienen que ser un objeto.')
  }
  const inmuebles = entero(datos.inmuebles, 'inmuebles')
  const bolsa = entero(datos.bolsa, 'bolsa')
  const liquidez = entero(datos.liquidez, 'liquidez')
  if (inmuebles + bolsa + liquidez !== 100) {
    throw new Error('Inmuebles, bolsa y liquidez tienen que sumar 100.')
  }
  const tolerancia =
    datos.tolerancia == null || datos.tolerancia === ''
      ? TOLERANCIA_DEFECTO
      : entero(datos.tolerancia, 'tolerancia')
  return { inmuebles, bolsa, liquidez, tolerancia }
}

/** null si no hay objetivo o el JSON guardado no vale. No lanza. */
export function objetivoValido(raw) {
  try {
    return prepararAsignacion(raw)
  } catch {
    return null
  }
}

function textoClase(partida) {
  const crudo = partida.category ?? partida.class ?? partida.clase ?? ''
  return String(crudo).trim().toLowerCase()
}

/** inmuebles, bolsa, liquidez, resto, o null si es deuda o no se reconoce. */
export function claseDe(partida) {
  if (!partida || typeof partida !== 'object') return null
  const kind = String(partida.kind ?? '').toLowerCase()
  if (kind === 'liability') return null
  const clase = textoClase(partida)
  if (!clase || DEUDA.has(clase)) return null
  if (clase === 'real_estate' || clase === 'inmueble' || clase === 'inmuebles') return 'inmuebles'
  if (clase === 'stocks' || clase === 'stock' || clase === 'etf') return 'bolsa'
  if (clase === 'cash' || clase === 'efectivo' || clase === 'liquidez') return 'liquidez'
  return 'resto'
}

function valorDe(partida) {
  const n = Number(partida.value ?? partida.valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Porcentajes, puntos y euros para volver al objetivo.
 * null si no hay objetivo. Avisa solo si |puntos| es mayor que la tolerancia.
 */
export function repartoActual(partidas, objetivo) {
  const meta = objetivoValido(objetivo)
  if (!meta) return null
  const lista = Array.isArray(partidas) ? partidas : []
  const valores = { inmuebles: 0, bolsa: 0, liquidez: 0, resto: 0 }
  for (const partida of lista) {
    const clase = claseDe(partida)
    if (!clase) continue
    const valor = valorDe(partida)
    if (!(valor > 0)) continue
    valores[clase] += valor
  }
  const total = valores.inmuebles + valores.bolsa + valores.liquidez + valores.resto
  if (!(total > 0)) {
    return {
      objetivo: meta,
      total: 0,
      clases: CLASES.map((clase) => ({
        clase,
        valor: 0,
        porcentaje: 0,
        objetivo: meta[clase],
        puntos: 0,
        euros: 0,
        fuera: false,
      })),
      avisos: [],
    }
  }
  const clases = CLASES.map((clase) => {
    const valor = valores[clase]
    const porcentaje = (valor / total) * 100
    const puntos = porcentaje - meta[clase]
    const euros = valor - (meta[clase] / 100) * total
    const fuera = Math.abs(puntos) > meta.tolerancia + 1e-9
    return {
      clase,
      valor: redondear(valor),
      porcentaje: redondear(porcentaje),
      objetivo: meta[clase],
      puntos: redondear(puntos),
      euros: redondear(euros),
      fuera,
    }
  })
  const avisos = []
  for (const fila of clases) {
    if (!fila.fuera) continue
    const cruda = valores[fila.clase] / total * 100 - meta[fila.clase]
    const sentido = cruda > 0 ? 'por encima' : 'por debajo'
    avisos.push(
      `${ETIQUETA[fila.clase]} está ${formatoPuntos(fila.puntos)} puntos ${sentido} del objetivo (${eurosTexto(fila.euros)} para volver).`,
    )
  }
  return { objetivo: meta, total: redondear(total), clases, avisos }
}
