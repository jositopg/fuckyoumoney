// Plusvalía latente y minusvalías pendientes de compensar.
// Sin coste fiscal el resultado es null, nunca 0.
// Una pérdida del año N caduca al terminar N+4 (IRPF: cuatro ejercicios siguientes).

const ANIOS_COMPENSACION = 4

function redondear(n) {
  return Math.round(Number(n) * 100) / 100
}

function positivo(valor) {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Coste fiscal: el total declarado, o participaciones × precio medio. Cero o ausente → null. */
export function costeFiscalDe(datos) {
  if (!datos || typeof datos !== 'object') return null
  const total = positivo(datos.costeFiscalTotal)
  if (total != null) return redondear(total)
  const shares = positivo(datos.participaciones)
  const medio = positivo(datos.precioMedioCompra)
  if (shares != null && medio != null) return redondear(shares * medio)
  return null
}

export function plusvaliaDe(datos) {
  const coste = costeFiscalDe(datos)
  if (coste == null) return null
  const valor = Number(datos.valor)
  if (!Number.isFinite(valor)) return null
  const euros = redondear(valor - coste)
  return {
    euros,
    porcentaje: redondear((euros / coste) * 100),
    coste,
  }
}

export function totalPlusvalias(partidas) {
  const conCoste = []
  for (const partida of partidas ?? []) {
    const plus = partida?.plusvalia ?? partida
    if (!plus || plus.coste == null || !(Number(plus.coste) > 0) || !Number.isFinite(Number(plus.euros))) continue
    conCoste.push(plus)
  }
  if (conCoste.length === 0) return null
  const euros = redondear(conCoste.reduce((suma, plus) => suma + Number(plus.euros), 0))
  const coste = redondear(conCoste.reduce((suma, plus) => suma + Number(plus.coste), 0))
  if (!(coste > 0)) return null
  return { euros, porcentaje: redondear((euros / coste) * 100), coste }
}

function eurosTexto(n) {
  const negativo = n < 0
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.')
  const grupos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negativo ? '-' : ''}${grupos},${decimales} €`
}

export function caducidadMinusvalia(item, anioActual) {
  const anio = Number(item?.anio)
  const importe = redondear(item?.importe)
  const compensado = redondear(item?.compensado ?? 0)
  const diferencia = redondear(importe - compensado)
  const pendiente = diferencia > 0 ? diferencia : 0
  const caduca = anio + ANIOS_COMPENSACION
  const hoy = Number(anioActual)
  let estado = 'vigente'
  if (!(pendiente > 0)) estado = 'compensada'
  else if (caduca < hoy) estado = 'caducada'
  else if (caduca === hoy) estado = 'caduca_este_ano'
  return { anio, importe, compensado, pendiente, caduca, estado }
}

export function resumenMinusvalias(lista, anioActual) {
  const minusvalias = (lista ?? [])
    .filter((item) => item && Number.isFinite(Number(item.anio)))
    .map((item) => caducidadMinusvalia(item, anioActual))
    .sort((a, b) => a.anio - b.anio)
  const avisos = minusvalias
    .filter((item) => item.estado === 'caduca_este_ano')
    .map(
      (item) =>
        `La minusvalía de ${item.anio} (${eurosTexto(item.pendiente)} pendientes) caduca este año (${item.caduca}).`,
    )
  return { minusvalias, avisos }
}

/** Un año, una fila. La última escritura de ese año sustituye a la anterior. */
export function upsertMinusvalia(lista, item) {
  const anio = Number(item.anio)
  const registro = {
    anio,
    importe: redondear(item.importe),
    compensado: redondear(item.compensado ?? 0),
  }
  const resto = (lista ?? []).filter((fila) => Number(fila.anio) !== anio)
  return [...resto, registro].sort((a, b) => a.anio - b.anio)
}
