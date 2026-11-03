// Serie diaria y variación en %. No interpola: el valor de un día es la última foto
// con fecha anterior o igual. Base 0 o ausente deja el porcentaje a null.

const MADRID = 'Europe/Madrid'

export function fechaMadrid(ahora = new Date()) {
  const fecha = ahora instanceof Date ? ahora : new Date(ahora)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha)
}

export function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** El 29 de febrero cae en el 28 del año anterior. */
export function restarAnios(fecha, anios) {
  const [y, m, d] = fecha.split('-').map(Number)
  const candidato = new Date(Date.UTC(y - anios, m - 1, d))
  if (candidato.getUTCMonth() !== m - 1) return new Date(Date.UTC(y - anios, m, 0)).toISOString().slice(0, 10)
  return candidato.toISOString().slice(0, 10)
}

function numero(valor) {
  if (valor == null || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

export function dedupePuntos(puntos) {
  const porFecha = new Map()
  for (const punto of puntos ?? []) {
    if (!punto?.fecha) continue
    porFecha.set(String(punto.fecha).slice(0, 10), punto)
  }
  return [...porFecha.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

function valorEnFecha(puntos, fecha) {
  let encontrado = null
  for (const punto of puntos) {
    if (punto.fecha <= fecha) encontrado = punto
    else break
  }
  return encontrado
}

function porcentaje(actual, base) {
  if (base == null || base === 0 || actual == null) return null
  return Math.round((((actual - base) / base) * 100) * 100) / 100
}

function puntoPublico(punto) {
  const fecha = String(punto.fecha).slice(0, 10)
  const valor = numero(punto.valor)
  const salida = { fecha, valor: valor ?? 0 }
  const shares = numero(punto.participaciones)
  const precio = numero(punto.precioPorParticipacion ?? punto.precio_por_participacion)
  if (shares != null && shares > 0) salida.participaciones = shares
  if (precio != null) salida.precioPorParticipacion = precio
  if (punto.kind === 'asset' || punto.kind === 'liability') salida.kind = punto.kind
  if (punto.position_id) salida.position_id = punto.position_id
  return salida
}

function variacionEntre(puntos, hasta, desde) {
  const actualP = valorEnFecha(puntos, hasta)
  const baseP = valorEnFecha(puntos, desde)
  const actual = actualP ? numero(actualP.valor) : null
  const base = baseP ? numero(baseP.valor) : null
  return { porcentaje: porcentaje(actual, base), base, actual, desde }
}

export function evolucionDe(puntos, opciones = {}) {
  const limpios = dedupePuntos(puntos).map(puntoPublico)
  const fin = opciones.hasta || (limpios.length ? limpios[limpios.length - 1].fecha : fechaMadrid())
  const base = limpios.filter((punto) => punto.fecha <= fin)
  const desde = opciones.desde || null
  const serie = base
    .filter((punto) => !desde || punto.fecha >= desde)
    .map(({ fecha, valor, participaciones, precioPorParticipacion }) => {
      const punto = { fecha, valor }
      if (participaciones != null) punto.participaciones = participaciones
      if (precioPorParticipacion != null) punto.precioPorParticipacion = precioPorParticipacion
      return punto
    })
  const anio = Number(fin.slice(0, 4))
  return {
    desde,
    hasta: fin,
    serie,
    variacion: {
      '1d': variacionEntre(base, fin, sumarDias(fin, -1)),
      '30d': variacionEntre(base, fin, sumarDias(fin, -30)),
      ytd: variacionEntre(base, fin, `${anio - 1}-12-31`),
      '12m': variacionEntre(base, fin, restarAnios(fin, 1)),
    },
  }
}

/** Neto en cada fecha con alguna foto. Una posición sin foto aún no aporta cero. */
export function netoDiario(filas, hasta) {
  const porPosicion = new Map()
  for (const fila of filas ?? []) {
    const fecha = String(fila.fecha).slice(0, 10)
    if (hasta && fecha > hasta) continue
    const id = fila.position_id ?? fila.positionId
    if (!id) continue
    if (!porPosicion.has(id)) porPosicion.set(id, [])
    porPosicion.get(id).push({ fecha, valor: numero(fila.valor) ?? 0, kind: fila.kind })
  }
  const posiciones = [...porPosicion.values()].map((puntos) => dedupePuntos(puntos))
  const fechas = [...new Set(posiciones.flatMap((puntos) => puntos.map((punto) => punto.fecha)))].sort()
  return fechas.map((fecha) => {
    let valor = 0
    for (const puntos of posiciones) {
      const punto = valorEnFecha(puntos, fecha)
      if (!punto) continue
      valor += (punto.kind === 'liability' ? -1 : 1) * Number(punto.valor)
    }
    return { fecha, valor: Math.round(valor * 100) / 100 }
  })
}

export function serieParaGrafico(puntos) {
  return dedupePuntos(puntos).map((punto) => ({ date: String(punto.fecha).slice(0, 10), value: numero(punto.valor) ?? 0 }))
}
