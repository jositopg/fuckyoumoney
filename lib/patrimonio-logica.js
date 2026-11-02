// Planes de lectura y escritura del patrimonio declarado.
// Los inmuebles que vienen de Finca no se tocan aquí.

export class PatrimonioError extends Error {}

const CLASES_ACTIVO = new Set(['cash', 'etf', 'stock', 'crypto', 'commodity', 'pension', 'vehicle', 'bond', 'other'])

const ALIAS_CLASE = {
  efectivo: 'cash',
  caja: 'cash',
  cash: 'cash',
  etf: 'etf',
  fondo: 'etf',
  accion: 'stock',
  acción: 'stock',
  stock: 'stock',
  cripto: 'crypto',
  crypto: 'crypto',
  oro: 'commodity',
  commodity: 'commodity',
  pension: 'pension',
  pensión: 'pension',
  vehiculo: 'vehicle',
  vehículo: 'vehicle',
  vehicle: 'vehicle',
  bono: 'bond',
  bond: 'bond',
  otro: 'other',
  other: 'other',
  deuda: 'deuda',
  hipoteca: 'hipoteca',
}

export const herramientas = [
  {
    nombre: 'patrimonio',
    descripcion: 'El resumen que usa la portada: patrimonio_ia(). No incluye email ni documentos.',
    argumentos: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nombre: 'posiciones',
    descripcion: 'Cuentas, fondos, deudas e inmuebles, con id para poder cambiar un saldo. Los de Finca salen como solo lectura.',
    argumentos: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nombre: 'fijar_valor',
    descripcion:
      'Cambia el saldo declarado de una cuenta, un fondo o una deuda. No vale para un inmueble que viene de Finca. Sin confirmar:true no escribe. Hace falta clave.',
    argumentos: {
      type: 'object',
      properties: {
        posicion: { type: 'string', description: 'Nombre o id.' },
        valor: { type: 'string', description: 'Euros. Admite 1.200,50. Cero es un saldo a cero.' },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['posicion', 'valor'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'crear_posicion',
    descripcion:
      'Crea una posición manual que no exista ya. No crea inmuebles: esos entran desde Finca. Sin confirmar:true no escribe.',
    argumentos: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        clase: {
          type: 'string',
          description: 'efectivo, etf, accion, cripto, oro, pension, vehiculo, otro, deuda o hipoteca.',
        },
        valor: { type: 'string' },
        institucion: { type: 'string' },
        confirmar: { type: 'boolean' },
        clave: { type: 'string' },
      },
      required: ['nombre', 'clase', 'valor'],
      additionalProperties: false,
    },
  },
]

export function esEscritura(nombre) {
  return nombre === 'fijar_valor' || nombre === 'crear_posicion'
}

function argsDe(args) {
  if (args == null) return {}
  if (typeof args !== 'object' || Array.isArray(args)) throw new PatrimonioError('Los argumentos tienen que ser un objeto.')
  return args
}

function texto(args, clave) {
  const valor = args[clave]
  if (valor == null || valor === '') return undefined
  if (typeof valor !== 'string') throw new PatrimonioError(`"${clave}" tiene que ser texto.`)
  const recorte = valor.trim()
  return recorte || undefined
}

export function normalizar(textoPlano) {
  return textoPlano.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function euros(raw, clave = 'valor') {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100) / 100
  if (typeof raw !== 'string') throw new PatrimonioError(`Falta "${clave}".`)
  const s = raw.trim().replace(/€/g, '').trim()
  if (!s) throw new PatrimonioError(`Falta "${clave}".`)
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  if (!Number.isFinite(n) || n < 0) throw new PatrimonioError(`"${clave}" tiene que ser un importe en euros, cero o más.`)
  return Math.round(n * 100) / 100
}

function confirmarDe(args) {
  const valor = args.confirmar
  if (valor == null || valor === false || valor === 'false') return false
  if (valor === true || valor === 'true') return true
  throw new PatrimonioError('"confirmar" tiene que ser true o false.')
}

function claveDe(args, confirmar) {
  const clave = texto(args, 'clave')
  if (!clave) {
    if (confirmar) throw new PatrimonioError('Para escribir hace falta "clave", un texto estable para no duplicar.')
    return undefined
  }
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(clave)) {
    throw new PatrimonioError('"clave" tiene que tener entre 8 y 80 letras, números, puntos, guiones o dos puntos.')
  }
  return clave
}

export function buscarPosicion(posiciones, consulta) {
  const q = normalizar(consulta)
  const porId = posiciones.find((p) => p.id === consulta.trim())
  if (porId) return porId
  const exactas = posiciones.filter((p) => normalizar(p.nombre) === q)
  if (exactas.length === 1) return exactas[0]
  const parciales = posiciones.filter((p) => normalizar(p.nombre).includes(q))
  const elegidas = exactas.length > 1 ? exactas : parciales
  if (elegidas.length === 1) return elegidas[0]
  if (elegidas.length === 0) throw new PatrimonioError(`No hay ninguna posición que coincida con "${consulta}".`)
  throw new PatrimonioError(`"${consulta}" coincide con varias: ${elegidas.map((p) => p.nombre).join(', ')}. Usa el nombre completo.`)
}

function esDeFinca(posicion) {
  return posicion.readOnly || posicion.source === 'finca' || posicion.institucion === 'finca'
}

function sumaTrozos(posicion) {
  const trozos = posicion.slices
  if (!Array.isArray(trozos)) return 0
  return trozos.reduce((s, t) => s + (Number(t.amount) || 0), 0)
}

function ficha(posicion, valor) {
  return {
    id: posicion.id,
    nombre: posicion.nombre,
    clase: posicion.clase,
    kind: posicion.kind,
    antes: posicion.valor,
    valor,
  }
}

export function planificar(nombre, args, posiciones) {
  if (!esEscritura(nombre)) throw new PatrimonioError(`"${nombre}" no escribe.`)
  const datos = argsDe(args)
  const confirmar = confirmarDe(datos)
  const clave = claveDe(datos, confirmar)

  if (nombre === 'fijar_valor') {
    const consulta = texto(datos, 'posicion')
    if (!consulta) throw new PatrimonioError('Falta "posicion".')
    const posicion = buscarPosicion(posiciones, consulta)
    if (esDeFinca(posicion)) {
      throw new PatrimonioError('Esa posición viene de Finca. El valor del inmueble se cambia en Las Fincas, no aquí.')
    }
    const valor = euros(datos.valor)
    const trozos = sumaTrozos(posicion)
    if (posicion.kind === 'asset' && valor + 0.001 < trozos) {
      throw new PatrimonioError('El saldo nuevo es menor que colchón más apartado. Ajusta esos trozos en la app.')
    }
    const cambio = ficha(posicion, valor)
    return {
      confirmar,
      clave,
      vista: { escrito: false, vistaPrevia: true, posicion: cambio },
      resultado: { escrito: true, repetida: false, posicion: cambio },
      kind: posicion.kind,
      id: posicion.id,
      valor,
      quantity: posicion.quantity,
    }
  }

  const nombreNuevo = texto(datos, 'nombre')
  const claseDada = texto(datos, 'clase')
  if (!nombreNuevo || !claseDada) throw new PatrimonioError('Faltan "nombre" y "clase".')
  const clase = ALIAS_CLASE[normalizar(claseDada)]
  if (!clase) throw new PatrimonioError(`"${claseDada}" no es una clase. Usa efectivo, etf, accion, cripto, pension, vehiculo, otro, deuda o hipoteca.`)
  if (posiciones.some((p) => normalizar(p.nombre) === normalizar(nombreNuevo))) {
    throw new PatrimonioError(`Ya hay una posición llamada "${nombreNuevo}". Usa fijar_valor.`)
  }
  const valor = euros(datos.valor)
  const institucion = texto(datos, 'institucion') ?? null
  const creada = { nombre: nombreNuevo, clase, valor, institucion }
  return {
    confirmar,
    clave,
    vista: { escrito: false, vistaPrevia: true, posicion: creada },
    resultado: { escrito: true, repetida: false, posicion: creada },
    crear: { nombre: nombreNuevo, clase, valor, institucion, tipoActivo: CLASES_ACTIVO.has(clase) ? clase : null },
  }
}

/** Deja lastInterestUpdate en las notas FYM1 sin perder trozos ni el texto. */
export function notasConInteres(notes, iso) {
  const prefix = 'FYM1:'
  let payload = {}
  if (typeof notes === 'string' && notes.startsWith(prefix)) {
    try {
      const parsed = JSON.parse(notes.slice(prefix.length))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = { ...parsed }
      else payload = { human: notes }
    } catch {
      payload = { human: notes }
    }
  } else if (typeof notes === 'string' && notes.trim()) {
    payload = { human: notes }
  }
  payload.lastInterestUpdate = iso
  return prefix + JSON.stringify(payload)
}

const SECRETOS = /email|dni|nif|phone|telefono|teléfono|password|token|secret/i

export function sinSecretos(valor) {
  if (Array.isArray(valor)) return valor.map(sinSecretos)
  if (valor && typeof valor === 'object') {
    const salida = {}
    for (const [k, v] of Object.entries(valor)) {
      if (SECRETOS.test(k)) continue
      salida[k] = sinSecretos(v)
    }
    return salida
  }
  return valor
}
