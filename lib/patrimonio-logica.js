// Planes de lectura y escritura del patrimonio declarado.
// fijar_valor y el resto de escrituras no tocan un inmueble de Finca.
// editar_registro y borrar_registro sí pueden corregir esa fila: la vista previa avisa de que el sync puede reescribirla.

import { prepararAsignacion, repartoActual } from './asignacion.js'
import { fechaMadrid } from './evolucion.js'
import { gastoEfectivo, prepararGastosReales } from './gastos.js'
import { plusvaliaDe, resumenMinusvalias } from './plusvalias.js'

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

const CAMPOS_DETALLE = new Set([
  'participaciones',
  'precioPorParticipacion',
  'precioMedioCompra',
  'costeFiscalTotal',
  'fechaCompra',
  'isin',
  'aportacionImporte',
  'aportacionFrecuencia',
  'aportacionAnual',
  'cuotaMensual',
  'tipoInteres',
  'plazoMeses',
  'fechaFin',
  'ingresoMensualNeto',
  'pagasAnuales',
  'institucion',
  'broker',
  'liquida',
  'assetClass',
  'composicion',
])

const CLASES_ASSET = new Set(['equity', 'bonds', 'mixed', 'money_market', 'commodity', 'real_estate'])
const CLAVES_COMPOSICION = ['equity', 'bonds', 'real_estate', 'commodity', 'money_market', 'cash']

const FRECUENCIAS = new Set(['mensual', 'trimestral', 'anual'])
const CLASES_BROKER = new Set(['etf', 'stock', 'bond', 'crypto', 'commodity'])
const LIMITE_PENSION_ANUAL = 1500
const AVISO_PENSION =
  'La aportación anual supera el límite general de 1.500 € de los planes de pensiones individuales.'

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
    nombre: 'evolucion',
    descripcion:
      'Serie diaria y variación en porcentaje (1 día, 30 días, año en curso y 12 meses). No escribe. Sin posicion devuelve el neto.',
    argumentos: {
      type: 'object',
      properties: {
        posicion: { type: 'string', description: 'Nombre o id. Si se omite, el neto de todas las fotos.' },
        desde: { type: 'string', description: 'AAAA-MM-DD. Recorta la serie. La variación puede usar una foto anterior.' },
        hasta: { type: 'string', description: 'AAAA-MM-DD. Por defecto, hoy en Madrid.' },
      },
      additionalProperties: false,
    },
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
  {
    nombre: 'fijar_detalle',
    descripcion:
      'Añade o cambia el detalle de una posición (participaciones, ISIN, institución, cuota, aportación, nómina). Solo toca los campos enviados. Sin confirmar:true no escribe. Hace falta clave. No vale para Finca.',
    argumentos: {
      type: 'object',
      properties: {
        posicion: { type: 'string', description: 'Nombre o id.' },
        campos: {
          type: 'object',
          description:
            'Solo estas claves: participaciones, precioPorParticipacion, precioMedioCompra, costeFiscalTotal, fechaCompra, isin, aportacionImporte, aportacionFrecuencia (mensual, trimestral o anual), aportacionAnual, cuotaMensual, tipoInteres, plazoMeses, fechaFin, ingresoMensualNeto, pagasAnuales (12 o 14), institucion, broker, liquida, assetClass, composicion.',
          properties: {
            participaciones: { type: 'number', description: 'Títulos. Mayor que cero.' },
            precioPorParticipacion: { type: 'number', description: 'Euros por título.' },
            precioMedioCompra: { type: 'number', description: 'Coste fiscal por título.' },
            costeFiscalTotal: { type: 'number' },
            fechaCompra: { type: 'string', description: 'AAAA-MM-DD.' },
            isin: { type: 'string', description: '12 caracteres, con dígito de control.' },
            aportacionImporte: { type: 'number' },
            aportacionFrecuencia: { type: 'string', enum: ['mensual', 'trimestral', 'anual'] },
            aportacionAnual: { type: 'number', description: 'Por encima de 1.500 € avisa, no rechaza.' },
            cuotaMensual: { type: 'number', description: 'Cuota de la deuda, en euros.' },
            tipoInteres: { type: 'number', description: 'Porcentaje anual.' },
            plazoMeses: { type: 'integer' },
            fechaFin: { type: 'string', description: 'AAAA-MM-DD.' },
            ingresoMensualNeto: { type: 'number', description: 'Nómina neta de un mes. No entra en el neto.' },
            pagasAnuales: { type: 'integer', enum: [12, 14] },
            institucion: { type: 'string', description: 'Pasa a la columna institution. En un fondo, también es el broker.' },
            broker: { type: 'string' },
            liquida: { type: 'boolean', description: 'Pasa a la columna is_liquid. Solo en un activo, no en una deuda.' },
            assetClass: {
              type: 'string',
              description:
                'equity, bonds, mixed, money_market, commodity o real_estate. El alias roboadvisor se guarda como mixed. Va a la metadata, no a una columna.',
            },
            composicion: {
              type: 'object',
              description:
                'Porcentajes de 0 a 100 que suman entre 99 y 101. Claves: equity, bonds, real_estate, commodity, money_market, cash. Va a la metadata.',
              properties: {
                equity: { type: 'number' },
                bonds: { type: 'number' },
                real_estate: { type: 'number' },
                commodity: { type: 'number' },
                money_market: { type: 'number' },
                cash: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['posicion', 'campos'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'fijar_minusvalia',
    descripcion:
      'Apunta una minusvalía pendiente de compensar de un año: importe y, si ya se compensó algo, compensado. El mismo año sustituye la fila. Sin confirmar:true no escribe. Hace falta clave.',
    argumentos: {
      type: 'object',
      properties: {
        anio: { type: 'integer', description: 'Año de la pérdida. Caduca al terminar ese año más cuatro.' },
        importe: { type: 'string', description: 'Euros de pérdida. Admite 1.200,50. Mayor que cero.' },
        compensado: { type: 'string', description: 'Euros ya compensados. Por defecto 0. No puede superar el importe.' },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['anio', 'importe'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'fijar_gastos',
    descripcion:
      'Guarda el gasto mensual real que calcula el agente Banco. No toca el ajuste manual ni los saldos. Sin confirmar:true no escribe. Hace falta clave. Si tiene menos de 60 días, el diagnóstico usa esta media.',
    argumentos: {
      type: 'object',
      properties: {
        mediaMensual: { type: 'string', description: 'Euros al mes. Admite 1.850,50. Mayor que cero.' },
        meses: { type: 'integer', description: 'Meses de la media. Entero de 3 a 24.' },
        fuente: { type: 'string', description: 'De dónde sale. Texto de 1 a 80 caracteres.' },
        hasta: { type: 'string', description: 'Último día del periodo, AAAA-MM-DD.' },
        desglose: {
          type: 'object',
          description: 'Opcional. Categoría y euros. No tiene que sumar la media.',
          additionalProperties: { type: 'string' },
        },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['mediaMensual', 'meses', 'fuente', 'hasta'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'fijar_asignacion',
    descripcion:
      'Guarda el reparto objetivo del perfil: inmuebles, bolsa y liquidez en porcentajes enteros que suman 100, y la tolerancia en puntos. Si no viene, la tolerancia es 5. No toca saldos ni el gasto. Sin confirmar:true no escribe. Hace falta clave.',
    argumentos: {
      type: 'object',
      properties: {
        inmuebles: { type: 'integer', description: 'Porcentaje de inmuebles, de 0 a 100. Incluye los de Finca.' },
        bolsa: { type: 'integer', description: 'Porcentaje de bolsa (fondos y acciones), de 0 a 100.' },
        liquidez: { type: 'integer', description: 'Porcentaje de liquidez (efectivo), de 0 a 100.' },
        tolerancia: { type: 'integer', description: 'Puntos de margen. Por defecto 5. Entero de 0 a 100.' },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['inmuebles', 'bolsa', 'liquidez'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'editar_registro',
    descripcion:
      'Corrige un error en una fila que ya existe: un saldo, una posición, is_liquid, la metadata, una deuda, una minusvalía, el perfil o una foto. Vale en assets, liabilities, profiles, minusvalias_pendientes, position_snapshots, wealth_snapshots y external_snapshots. Sin confirmar:true no escribe. La vista previa enseña el antes y el después de los campos tocados. Al confirmar hace falta clave. No cambia id, user_id ni created_at. En minusvalias_pendientes el id es el año. En position_snapshots el id es position_id|fecha (AAAA-MM-DD). Una fila de Finca también se puede corregir: la vista previa avisa de que el sync puede volver a escribirla. Sustituye al #15: is_liquid se cambia con { tabla: "assets", campos: { is_liquid: true } }.',
    argumentos: {
      type: 'object',
      properties: {
        tabla: {
          type: 'string',
          description:
            'assets, liabilities, profiles, minusvalias_pendientes, position_snapshots, wealth_snapshots o external_snapshots.',
        },
        id: {
          type: 'string',
          description:
            'Id de la fila. En profiles, el id del usuario. En minusvalias_pendientes, el año. En position_snapshots, position_id|fecha.',
        },
        campos: {
          type: 'object',
          description: 'Columnas a corregir. La clave es el nombre en la base y el valor es el nuevo. null vacía la columna.',
          additionalProperties: true,
        },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['tabla', 'id', 'campos'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'borrar_registro',
    descripcion:
      'Borra una fila guardada por error en assets, liabilities, profiles, minusvalias_pendientes, position_snapshots, wealth_snapshots o external_snapshots. Sin confirmar:true no borra. La vista previa enseña la fila entera y el después queda vacío. Al confirmar hace falta clave. En minusvalias_pendientes el id es el año. En position_snapshots el id es position_id|fecha (AAAA-MM-DD). Una fila de Finca también se puede borrar: la vista previa avisa de que el sync puede volver a escribirla.',
    argumentos: {
      type: 'object',
      properties: {
        tabla: {
          type: 'string',
          description:
            'assets, liabilities, profiles, minusvalias_pendientes, position_snapshots, wealth_snapshots o external_snapshots.',
        },
        id: {
          type: 'string',
          description:
            'Id de la fila. En profiles, el id del usuario. En minusvalias_pendientes, el año. En position_snapshots, position_id|fecha.',
        },
        confirmar: { type: 'boolean' },
        clave: { type: 'string', description: 'Obligatoria al confirmar. 8 a 80 caracteres estables.' },
      },
      required: ['tabla', 'id'],
      additionalProperties: false,
    },
  },
]

export function esCorreccion(nombre) {
  return nombre === 'editar_registro' || nombre === 'borrar_registro'
}

export function esEscritura(nombre) {
  return (
    nombre === 'fijar_valor' ||
    nombre === 'crear_posicion' ||
    nombre === 'fijar_detalle' ||
    nombre === 'fijar_minusvalia' ||
    nombre === 'fijar_gastos' ||
    nombre === 'fijar_asignacion' ||
    esCorreccion(nombre)
  )
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

export const TABLAS_CORRECCION = [
  'assets',
  'liabilities',
  'profiles',
  'minusvalias_pendientes',
  'position_snapshots',
  'wealth_snapshots',
  'external_snapshots',
]

const COLUMNAS_BLOQUEADAS = new Set(['id', 'user_id', 'created_at'])

export function pedidoCorreccion(nombre, args) {
  if (!esCorreccion(nombre)) throw new PatrimonioError(`"${nombre}" no corrige una fila.`)
  const datos = argsDe(args)
  const confirmar = confirmarDe(datos)
  const clave = claveDe(datos, confirmar)
  const tabla = texto(datos, 'tabla')
  if (!tabla) throw new PatrimonioError('Falta "tabla".')
  if (!TABLAS_CORRECCION.includes(tabla)) {
    throw new PatrimonioError(`"${tabla}" no es una tabla. Usa una de: ${TABLAS_CORRECCION.join(', ')}.`)
  }
  const id = texto(datos, 'id')
  if (!id) throw new PatrimonioError('Falta "id".')
  if (nombre === 'borrar_registro') {
    return { herramienta: nombre, tabla, id, campos: {}, confirmar, clave }
  }
  const entrada = datos.campos
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new PatrimonioError('"campos" tiene que ser un objeto.')
  }
  const claves = Object.keys(entrada)
  if (claves.length === 0) throw new PatrimonioError('No hay ningún campo que guardar.')
  for (const columna of claves) {
    if (COLUMNAS_BLOQUEADAS.has(columna)) throw new PatrimonioError(`No se puede cambiar "${columna}".`)
  }
  return { herramienta: nombre, tabla, id, campos: entrada, confirmar, clave }
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

function extraDeNotas(notes) {
  const prefix = 'FYM1:'
  if (typeof notes !== 'string' || !notes.startsWith(prefix)) return {}
  try {
    const parsed = JSON.parse(notes.slice(prefix.length))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    return {}
  }
  return {}
}

function lecturaDe(posicion) {
  const extra = extraDeNotas(posicion?.notes)
  const meta = posicion?.metadata && typeof posicion.metadata === 'object' && !Array.isArray(posicion.metadata) ? posicion.metadata : {}
  const col = posicion?.columnas && typeof posicion.columnas === 'object' ? posicion.columnas : {}
  return {
    ...extra,
    ...meta,
    ...(col.monthlyPayment != null && meta.monthlyPayment == null && extra.monthlyPayment == null
      ? { monthlyPayment: Number(col.monthlyPayment) }
      : {}),
    ...(col.interestRate != null && meta.interestRate == null && extra.interestRate == null
      ? { interestRate: Number(col.interestRate) }
      : {}),
    ...(col.endDate && meta.fechaFin == null && extra.fechaFin == null && meta.dueDate == null && extra.dueDate == null
      ? { fechaFin: col.endDate }
      : {}),
    ...(col.purchaseDate && meta.fechaCompra == null && extra.fechaCompra == null ? { fechaCompra: col.purchaseDate } : {}),
    ...(col.purchasePrice != null && meta.precioMedioCompra == null && extra.precioMedioCompra == null
      ? { precioMedioCompra: Number(col.purchasePrice) }
      : {}),
  }
}

function assetClassDe(raw) {
  if (typeof raw !== 'string') {
    throw new PatrimonioError(
      '"assetClass" tiene que ser equity, bonds, mixed, money_market, commodity o real_estate.',
    )
  }
  const s = raw.trim().toLowerCase()
  if (s === 'roboadvisor') return 'mixed'
  if (!CLASES_ASSET.has(s)) {
    throw new PatrimonioError(
      '"assetClass" tiene que ser equity, bonds, mixed, money_market, commodity o real_estate.',
    )
  }
  return s
}

function composicionDe(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PatrimonioError('"composicion" tiene que ser un objeto.')
  }
  for (const k of Object.keys(raw)) {
    if (!CLAVES_COMPOSICION.includes(k)) throw new PatrimonioError(`"composicion" no admite la clave "${k}".`)
  }
  const out = {}
  let suma = 0
  for (const k of CLAVES_COMPOSICION) {
    if (!(k in raw)) continue
    const n = numero(raw[k], `composicion.${k}`)
    if (n < 0 || n > 100) throw new PatrimonioError(`"composicion.${k}" tiene que ser un número entre 0 y 100.`)
    out[k] = n
    suma += n
  }
  if (suma < 99 || suma > 101) throw new PatrimonioError('"composicion" tiene que sumar entre 99 y 101.')
  return out
}

function numero(raw, clave) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') throw new PatrimonioError(`"${clave}" tiene que ser un número.`)
  const s = raw.trim().replace(/€/g, '').replace(/%/g, '').trim()
  if (!s) throw new PatrimonioError(`Falta "${clave}".`)
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  if (!Number.isFinite(n)) throw new PatrimonioError(`"${clave}" tiene que ser un número.`)
  return n
}

function importe(raw, clave) {
  const n = euros(raw, clave)
  if (n < 0) throw new PatrimonioError(`"${clave}" tiene que ser un importe en euros, cero o más.`)
  return n
}

function redondear(n, decimales) {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

export function fechaReal(raw, clave) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new PatrimonioError(`"${clave}" tiene que ser una fecha real con la forma AAAA-MM-DD.`)
  }
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new PatrimonioError(`"${clave}" tiene que ser una fecha real con la forma AAAA-MM-DD.`)
  }
  return raw
}

/** ISIN de 12 caracteres con el dígito de control de ISO 6166. Devuelve el código en mayúsculas o false. */
export function isinNormalizado(raw) {
  if (typeof raw !== 'string') return false
  const s = raw.trim().toUpperCase()
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false
  let digits = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    digits += code >= 48 && code <= 57 ? ch : String(code - 55)
  }
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0 ? s : false
}

export function precioUnitario(valor, participaciones) {
  const shares = Number(participaciones)
  const v = Number(valor)
  if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(v) || v <= 0) return undefined
  return redondear(v / shares, 4)
}

export function participacionesDe(posicion) {
  const n = Number(lecturaDe(posicion).participaciones)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

function valorActual(lectura, posicion, clave) {
  switch (clave) {
    case 'participaciones':
      return participacionesDe(posicion)
    case 'precioPorParticipacion':
      return participacionesDe(posicion) ? precioUnitario(posicion.valor, participacionesDe(posicion)) : lectura.precioPorParticipacion
    case 'cuotaMensual':
      return lectura.monthlyPayment ?? lectura.cuotaMensual
    case 'tipoInteres':
      return lectura.tipoInteres ?? lectura.interestRate
    case 'fechaFin':
      return lectura.fechaFin ?? lectura.dueDate
    case 'institucion':
      return posicion.institucion ?? null
    case 'liquida':
      return posicion.liquida === true
    case 'broker':
      return lectura.broker
    default:
      return lectura[clave]
  }
}

function planDetalle(datos, posiciones, confirmar, clave) {
  const consulta = texto(datos, 'posicion')
  if (!consulta) throw new PatrimonioError('Falta "posicion".')
  const campos = datos.campos
  if (campos == null) throw new PatrimonioError('Falta "campos".')
  if (typeof campos !== 'object' || Array.isArray(campos)) throw new PatrimonioError('"campos" tiene que ser un objeto.')
  const claves = Object.keys(campos)
  if (claves.length === 0) throw new PatrimonioError('No hay ningún campo que fijar.')
  for (const k of claves) {
    if (!CAMPOS_DETALLE.has(k)) throw new PatrimonioError(`El campo "${k}" no se puede fijar.`)
  }

  const posicion = buscarPosicion(posiciones, consulta)
  if (esDeFinca(posicion)) {
    throw new PatrimonioError('Esa posición viene de Finca. El detalle se cambia en Las Fincas, no aquí.')
  }

  const patch = {}
  const columnas = {}
  const lectura = lecturaDe(posicion)

  if ('participaciones' in campos) {
    const n = numero(campos.participaciones, 'participaciones')
    const shares = redondear(n, 6)
    if (shares <= 0) throw new PatrimonioError('"participaciones" tiene que ser un número mayor que cero.')
    patch.participaciones = shares
    columnas.quantity = shares
  }
  if ('precioPorParticipacion' in campos) {
    patch.precioPorParticipacion = importe(campos.precioPorParticipacion, 'precioPorParticipacion')
  }
  if ('precioMedioCompra' in campos) {
    const n = importe(campos.precioMedioCompra, 'precioMedioCompra')
    patch.precioMedioCompra = n
    columnas.purchasePrice = n
  }
  if ('costeFiscalTotal' in campos) patch.costeFiscalTotal = importe(campos.costeFiscalTotal, 'costeFiscalTotal')
  if ('fechaCompra' in campos) {
    const fecha = fechaReal(campos.fechaCompra, 'fechaCompra')
    patch.fechaCompra = fecha
    columnas.purchaseDate = fecha
  }
  if ('isin' in campos) {
    const isin = isinNormalizado(campos.isin)
    if (!isin) throw new PatrimonioError('El ISIN no es válido.')
    patch.isin = isin
  }
  if ('aportacionImporte' in campos) patch.aportacionImporte = importe(campos.aportacionImporte, 'aportacionImporte')
  if ('aportacionFrecuencia' in campos) {
    if (typeof campos.aportacionFrecuencia !== 'string') {
      throw new PatrimonioError('"aportacionFrecuencia" tiene que ser mensual, trimestral o anual.')
    }
    const f = normalizar(campos.aportacionFrecuencia)
    if (!FRECUENCIAS.has(f)) throw new PatrimonioError('"aportacionFrecuencia" tiene que ser mensual, trimestral o anual.')
    patch.aportacionFrecuencia = f
  }
  if ('aportacionAnual' in campos) patch.aportacionAnual = importe(campos.aportacionAnual, 'aportacionAnual')
  if ('cuotaMensual' in campos) {
    const n = importe(campos.cuotaMensual, 'cuotaMensual')
    patch.cuotaMensual = n
    patch.monthlyPayment = n
    if (posicion.kind === 'liability') columnas.monthlyPayment = n
  }
  if ('tipoInteres' in campos) {
    const n = numero(campos.tipoInteres, 'tipoInteres')
    if (n < 0) throw new PatrimonioError('"tipoInteres" tiene que ser un porcentaje, cero o más.')
    const tasa = redondear(n, 4)
    patch.tipoInteres = tasa
    if (posicion.kind === 'liability') {
      patch.interestRate = tasa
      columnas.interestRate = tasa
    }
  }
  if ('plazoMeses' in campos) {
    const n = numero(campos.plazoMeses, 'plazoMeses')
    if (!Number.isInteger(n) || n <= 0) {
      throw new PatrimonioError('"plazoMeses" tiene que ser un número entero de meses, mayor que cero.')
    }
    patch.plazoMeses = n
  }
  if ('fechaFin' in campos) {
    const fecha = fechaReal(campos.fechaFin, 'fechaFin')
    patch.fechaFin = fecha
    if (posicion.kind === 'liability') columnas.endDate = fecha
  }
  if ('ingresoMensualNeto' in campos) patch.ingresoMensualNeto = importe(campos.ingresoMensualNeto, 'ingresoMensualNeto')
  if ('pagasAnuales' in campos) {
    const n = typeof campos.pagasAnuales === 'string' ? Number(campos.pagasAnuales.trim()) : campos.pagasAnuales
    if (n !== 12 && n !== 14) throw new PatrimonioError('"pagasAnuales" tiene que ser 12 o 14.')
    patch.pagasAnuales = n
  }
  if ('institucion' in campos || 'broker' in campos) {
    const institucion = 'institucion' in campos ? texto(campos, 'institucion') : undefined
    const broker = 'broker' in campos ? texto(campos, 'broker') : undefined
    if ('institucion' in campos && !institucion) throw new PatrimonioError('Falta "institucion".')
    if ('broker' in campos && !broker) throw new PatrimonioError('Falta "broker".')
    const columna = institucion ?? broker
    if (normalizar(columna) === 'finca') throw new PatrimonioError('La institución no puede ser Finca.')
    if (columna.length > 80) throw new PatrimonioError('"institucion" admite como mucho 80 caracteres.')
    columnas.institution = columna
    const brokerMeta = broker ?? (CLASES_BROKER.has(posicion.clase) || posicion.clase === 'pension' ? institucion : undefined)
    if (brokerMeta) {
      patch.broker = brokerMeta
      if (posicion.clase === 'pension') patch.manager = brokerMeta
    }
  }
  if ('liquida' in campos) {
    if (typeof campos.liquida !== 'boolean') throw new PatrimonioError('"liquida" tiene que ser true o false.')
    if (posicion.kind === 'liability') throw new PatrimonioError('"liquida" no vale en una deuda.')
    columnas.isLiquid = campos.liquida
  }
  if ('assetClass' in campos) patch.assetClass = assetClassDe(campos.assetClass)
  if ('composicion' in campos) patch.composicion = composicionDe(campos.composicion)

  const quierePrecio = 'participaciones' in campos || 'precioPorParticipacion' in campos
  const shares = quierePrecio ? (patch.participaciones ?? participacionesDe(posicion)) : undefined
  const unit = quierePrecio ? precioUnitario(posicion.valor, shares) : undefined
  if (quierePrecio && unit != null) {
    patch.precioPorParticipacion = unit
    patch.pricePerUnit = unit
  } else if (quierePrecio && patch.precioPorParticipacion != null) {
    patch.pricePerUnit = patch.precioPorParticipacion
  }

  const avisos = patch.aportacionAnual > LIMITE_PENSION_ANUAL ? [AVISO_PENSION] : []
  const antes = {}
  const despues = {}
  for (const k of claves) {
    antes[k] = valorActual(lectura, posicion, k) ?? null
    despues[k] =
      k === 'institucion' ? (columnas.institution ?? null) : k === 'liquida' ? (columnas.isLiquid ?? null) : (patch[k] ?? null)
  }
  if (shares && ('participaciones' in campos || 'precioPorParticipacion' in campos)) {
    despues.precioPorParticipacion = unit ?? patch.precioPorParticipacion ?? null
    if (!('precioPorParticipacion' in campos)) antes.precioPorParticipacion = valorActual(lectura, posicion, 'precioPorParticipacion') ?? null
  }

  const vistaPosicion = {
    id: posicion.id,
    nombre: posicion.nombre,
    clase: posicion.clase,
    kind: posicion.kind,
    antes,
    despues,
  }
  const resultadoPosicion = {
    id: posicion.id,
    nombre: posicion.nombre,
    clase: posicion.clase,
    kind: posicion.kind,
    ...despues,
    institucion: columnas.institution ?? posicion.institucion ?? null,
  }
  const aviso = avisos.length ? { avisos } : {}
  return {
    confirmar,
    clave,
    detalle: true,
    kind: posicion.kind,
    id: posicion.id,
    metadata: patch,
    notas: patch,
    columnas,
    vista: { escrito: false, vistaPrevia: true, posicion: vistaPosicion, ...aviso },
    resultado: { escrito: true, repetida: false, posicion: resultadoPosicion, ...aviso },
  }
}

const CAMPOS_PUBLICOS = [
  ['participaciones', 'participaciones'],
  ['precioMedioCompra', 'precioMedioCompra'],
  ['costeFiscalTotal', 'costeFiscalTotal'],
  ['fechaCompra', 'fechaCompra'],
  ['isin', 'isin'],
  ['aportacionImporte', 'aportacionImporte'],
  ['aportacionFrecuencia', 'aportacionFrecuencia'],
  ['aportacionAnual', 'aportacionAnual'],
  ['plazoMeses', 'plazoMeses'],
  ['ingresoMensualNeto', 'ingresoMensualNeto'],
  ['pagasAnuales', 'pagasAnuales'],
]

export function fichaDe(p) {
  const lectura = lecturaDe(p)
  const fichaPublica = {
    id: p.id,
    nombre: p.nombre,
    clase: p.clase,
    kind: p.kind,
    valor: Math.round(Number(p.valor) * 100) / 100,
    source: p.source ?? 'manual',
    soloLectura: Boolean(p.readOnly),
    institucion: p.institucion ?? (typeof lectura.broker === 'string' ? lectura.broker : null),
    liquida: p.liquida === true,
  }
  const shares = participacionesDe(p)
  if (shares) {
    fichaPublica.participaciones = shares
    const unit = precioUnitario(p.valor, shares)
    if (unit != null) fichaPublica.precioPorParticipacion = unit
  } else if (lectura.precioPorParticipacion != null && lectura.participaciones == null) {
    fichaPublica.precioPorParticipacion = lectura.precioPorParticipacion
  }
  for (const [salida, origen] of CAMPOS_PUBLICOS) {
    if (salida === 'participaciones') continue
    const valor = lectura[origen]
    if (valor != null && valor !== '') fichaPublica[salida] = valor
  }
  const cuota = lectura.monthlyPayment ?? lectura.cuotaMensual
  if (cuota != null) fichaPublica.cuotaMensual = cuota
  const tasa = lectura.tipoInteres ?? (p.kind === 'liability' ? lectura.interestRate : undefined)
  if (tasa != null && p.kind === 'liability') fichaPublica.tipoInteres = tasa
  else if (lectura.tipoInteres != null) fichaPublica.tipoInteres = lectura.tipoInteres
  const fin = lectura.fechaFin ?? lectura.dueDate
  if (fin) fichaPublica.fechaFin = fin
  if (typeof lectura.assetClass === 'string' && lectura.assetClass !== '') fichaPublica.assetClass = lectura.assetClass
  if (lectura.composicion && typeof lectura.composicion === 'object' && !Array.isArray(lectura.composicion)) {
    fichaPublica.composicion = lectura.composicion
  }
  fichaPublica.plusvalia = plusvaliaDe({
    valor: fichaPublica.valor,
    participaciones: fichaPublica.participaciones,
    precioMedioCompra: lectura.precioMedioCompra,
    costeFiscalTotal: lectura.costeFiscalTotal,
  })
  return fichaPublica
}

/** La vista previa no escribe. Una clave ya guardada no vuelve a escribir. */
export function responderEscritura(orden, previa) {
  if (!orden?.confirmar) return { escribir: false, cuerpo: orden.vista }
  if (previa && typeof previa === 'object') return { escribir: false, cuerpo: { ...previa, repetida: true } }
  return { escribir: true, cuerpo: orden.resultado }
}

function fechaOpcional(datos, clave) {
  if (datos[clave] == null || datos[clave] === '') return undefined
  return fechaReal(datos[clave], clave)
}

/** Lectura. Finca se puede consultar. No escribe. */
export function planEvolucion(args, posiciones, hoy) {
  const datos = argsDe(args)
  const consulta = texto(datos, 'posicion')
  const posicion = consulta ? buscarPosicion(posiciones, consulta) : null
  const desde = fechaOpcional(datos, 'desde') ?? null
  const hasta = fechaOpcional(datos, 'hasta') ?? hoy
  if (typeof hasta !== 'string') throw new PatrimonioError('Falta "hasta".')
  if (desde && desde > hasta) throw new PatrimonioError('"desde" no puede ser posterior a "hasta".')
  return { posicion, posicionId: posicion?.id ?? null, desde, hasta }
}

function anioDe(raw) {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  if (!Number.isInteger(n) || n < 1990 || n > 2100) {
    throw new PatrimonioError('"anio" tiene que ser un año entre 1990 y 2100.')
  }
  return n
}

function planAsignacion(datos, confirmar, clave, posiciones) {
  let registro
  try {
    registro = prepararAsignacion(datos)
  } catch (err) {
    throw new PatrimonioError(err instanceof Error ? err.message : 'La asignación no es válida.')
  }
  const asignacion = repartoActual(posiciones, registro)
  return {
    confirmar,
    clave,
    asignacion: registro,
    vista: { escrito: false, vistaPrevia: true, asignacionObjetivo: registro, asignacion },
    resultado: { escrito: true, repetida: false, asignacionObjetivo: registro, asignacion },
  }
}

function planGastos(datos, confirmar, clave, ahora) {
  let registro
  try {
    registro = prepararGastosReales(datos, ahora)
  } catch (err) {
    throw new PatrimonioError(err instanceof Error ? err.message : 'El gasto no es válido.')
  }
  const leido = gastoEfectivo(0, registro, ahora)
  const gasto = {
    importe: leido.importe,
    origen: leido.origen,
    caducado: false,
    actualizado: leido.actualizado,
    hasta: leido.hasta,
    fuente: leido.fuente,
    meses: leido.meses,
  }
  return {
    confirmar,
    clave,
    gastos: registro,
    vista: { escrito: false, vistaPrevia: true, gastosReales: registro, gasto },
    resultado: { escrito: true, repetida: false, gastosReales: registro, gasto },
  }
}

function planMinusvalia(datos, confirmar, clave) {
  if (datos.anio == null || datos.anio === '') throw new PatrimonioError('Falta "anio".')
  if (datos.importe == null || datos.importe === '') throw new PatrimonioError('Falta "importe".')
  const anio = anioDe(datos.anio)
  const importe = euros(datos.importe, 'importe')
  if (importe <= 0) throw new PatrimonioError('"importe" tiene que ser mayor que cero.')
  const compensado = datos.compensado == null || datos.compensado === '' ? 0 : euros(datos.compensado, 'compensado')
  if (compensado > importe) throw new PatrimonioError('"compensado" no puede superar el importe.')
  const registro = { anio, importe, compensado }
  const fiscal = resumenMinusvalias([registro], Number(fechaMadrid().slice(0, 4)))
  const aviso = fiscal.avisos.length ? { avisos: fiscal.avisos } : {}
  const minusvalia = fiscal.minusvalias[0]
  return {
    confirmar,
    clave,
    minusvalia: registro,
    vista: { escrito: false, vistaPrevia: true, minusvalia, ...aviso },
    resultado: { escrito: true, repetida: false, minusvalia, ...aviso },
  }
}

export function planificar(nombre, args, posiciones, ahora = new Date().toISOString()) {
  if (!esEscritura(nombre)) throw new PatrimonioError(`"${nombre}" no escribe.`)
  if (esCorreccion(nombre)) throw new PatrimonioError(`"${nombre}" se aplica sobre la base.`)
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

  if (nombre === 'fijar_detalle') return planDetalle(datos, posiciones, confirmar, clave)
  if (nombre === 'fijar_minusvalia') return planMinusvalia(datos, confirmar, clave)
  if (nombre === 'fijar_gastos') return planGastos(datos, confirmar, clave, ahora)
  if (nombre === 'fijar_asignacion') return planAsignacion(datos, confirmar, clave, posiciones)

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

/** Mezcla claves en las notas FYM1 sin perder trozos, el texto ni lastInterestUpdate. */
export function notasConParche(notes, parche) {
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
  for (const [k, v] of Object.entries(parche || {})) {
    if (v !== undefined) payload[k] = v
  }
  if (Object.keys(payload).length === 0) return typeof notes === 'string' ? notes : null
  return prefix + JSON.stringify(payload)
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
