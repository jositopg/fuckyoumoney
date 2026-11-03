import { randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { evolucionDe, fechaMadrid, netoDiario } from '../lib/evolucion.js'
import { resumenMinusvalias, totalPlusvalias } from '../lib/plusvalias.js'
import {
  PatrimonioError,
  esEscritura,
  fichaDe,
  herramientas,
  notasConInteres,
  notasConParche,
  participacionesDe,
  planEvolucion,
  planificar,
  precioUnitario,
  responderEscritura,
  sinSecretos,
} from '../lib/patrimonio-logica.js'

const { Client, types } = pg
types.setTypeParser(1082, (valor) => valor)
types.setTypeParser(1114, (valor) => valor)
types.setTypeParser(1184, (valor) => valor)

function cargarEnv() {
  const path = join(homedir(), '.fuckyoumoney-db.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

function tokenValido(autorizacion, esperado) {
  if (!esperado) return false
  const recibido = autorizacion?.startsWith('Bearer ') ? autorizacion.slice('Bearer '.length).trim() : ''
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function enviar(res, status, datos) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(datos))
}

function mensajeSeguro(err) {
  const texto = err instanceof Error ? err.message : 'Error'
  return texto.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://…').replace(/[\w.-]*supabase\.co/gi, '…')
}

async function leerCuerpo(req) {
  if (req.body != null && req.body !== '') {
    if (typeof req.body === 'string') return req.body.trim() ? JSON.parse(req.body) : undefined
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString('utf8').trim()
      return raw ? JSON.parse(raw) : undefined
    }
    return req.body
  }
  const trozos = []
  for await (const trozo of req) trozos.push(typeof trozo === 'string' ? Buffer.from(trozo) : trozo)
  const raw = Buffer.concat(trozos).toString('utf8').trim()
  return raw ? JSON.parse(raw) : undefined
}

const SQL_POSICIONES = `
select a.id, a.user_id, a.name, a.type::text as clase, 'asset'::text as kind,
       coalesce(nullif(a.manual_value, 0), a.quantity * coalesce(a.purchase_price, 0), 0) as valor,
       a.source, a.institution, a.read_only, a.metadata, a.notes, a.quantity,
       null::numeric as monthly_payment, null::numeric as interest_rate, null::date as end_date,
       a.purchase_date, a.purchase_price
from assets a
union all
select l.id, l.user_id, l.name, l.type::text, 'liability'::text,
       l.balance, l.source, l.institution, false, coalesce(l.metadata, '{}'::jsonb), l.notes, null::numeric,
       l.monthly_payment, l.interest_rate, l.end_date, null::date, null::numeric
from liabilities l
`

function trozosDe(fila) {
  const meta = fila.metadata && typeof fila.metadata === 'object' ? fila.metadata : {}
  let extra = {}
  if (typeof fila.notes === 'string' && fila.notes.startsWith('FYM1:')) {
    try {
      extra = JSON.parse(fila.notes.slice(5))
    } catch {
      extra = {}
    }
  }
  const slices = meta.slices ?? extra.slices
  const quantity = Number(meta.quantity ?? extra.quantity ?? fila.quantity)
  return {
    id: fila.id,
    nombre: fila.name,
    clase: fila.clase,
    kind: fila.kind,
    valor: Number(fila.valor),
    source: fila.source,
    institucion: fila.institution,
    readOnly: fila.read_only === true || fila.institution === 'finca' || fila.source === 'finca',
    slices: Array.isArray(slices) ? slices : undefined,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    metadata: meta,
    notes: typeof fila.notes === 'string' ? fila.notes : null,
    columnas: {
      monthlyPayment: fila.monthly_payment == null ? undefined : Number(fila.monthly_payment),
      interestRate: fila.interest_rate == null ? undefined : Number(fila.interest_rate),
      endDate: fila.end_date || undefined,
      purchaseDate: fila.purchase_date || undefined,
      purchasePrice: fila.purchase_price == null ? undefined : Number(fila.purchase_price),
    },
  }
}

function fichaPublica(p) {
  return fichaDe(p)
}

async function conCliente(fn) {
  cargarEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')
  const cliente = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 })
  await cliente.connect()
  try {
    return await fn(cliente)
  } finally {
    await cliente.end()
  }
}

async function usuarioDe(cliente) {
  const perfiles = await cliente.query('select id from profiles order by id')
  if (perfiles.rows.length !== 1) throw new PatrimonioError('Hace falta un único perfil para leer y escribir el patrimonio.')
  return perfiles.rows[0].id
}

async function posicionesDe(cliente, userId) {
  const filas = await cliente.query(`${SQL_POSICIONES} order by 3`, [])
  return filas.rows.filter((f) => f.user_id === userId).map(trozosDe)
}

const CREAR_TABLA = `create table if not exists agente_escrituras (
  clave text primary key,
  herramienta text not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
)`

async function aplicar(cliente, userId, nombre, args) {
  const posiciones = await posicionesDe(cliente, userId)
  const orden = planificar(nombre, args, posiciones)
  const sinConfirmar = responderEscritura(orden, null)
  if (!sinConfirmar.escribir) return sinConfirmar.cuerpo
  await cliente.query('begin')
  try {
    await cliente.query(CREAR_TABLA)
    const previa = await cliente.query('select resultado from agente_escrituras where clave = $1', [orden.clave])
    const decision = responderEscritura(orden, previa.rows[0]?.resultado ?? null)
    if (!decision.escribir) {
      await cliente.query('commit')
      return decision.cuerpo
    }
    if (orden.detalle) {
      await escribirDetalle(cliente, userId, posiciones, orden)
    } else if (orden.kind) {
      if (orden.kind === 'liability') {
        const hecho = await cliente.query(
          `update liabilities set balance = $1, updated_at = now() where id = $2 and user_id = $3`,
          [orden.valor, orden.id, userId],
        )
        if ((hecho.rowCount ?? 0) === 0) throw new PatrimonioError('No se ha podido actualizar esa deuda.')
      } else {
        const ahora = new Date().toISOString()
        const metadata = {
          ...ordenPosicionMetadata(posiciones, orden.id),
          ...precio(posiciones, orden.id, orden.valor),
          lastInterestUpdate: ahora,
        }
        const notes = notasConInteres(notasDe(posiciones, orden.id), ahora)
        // $1 se usa dos veces. Sin ::numeric Postgres deduce numeric (la columna) e integer (el 0) y rechaza la escritura.
        const hecho = await cliente.query(
          `update assets
             set manual_value = $1::numeric,
                 purchase_price = case when $1::numeric = 0 then 0 else purchase_price end,
                 metadata = $2::jsonb,
                 notes = $5,
                 updated_at = now()
           where id = $3 and user_id = $4
             and coalesce(source, '') <> 'finca'
             and read_only is not true
             and coalesce(institution, '') <> 'finca'`,
          [orden.valor, JSON.stringify(metadata), orden.id, userId, notes],
        )
        if ((hecho.rowCount ?? 0) === 0) throw new PatrimonioError('No se ha podido actualizar esa posición.')
      }
    } else if (orden.crear) {
      const id = randomUUID()
      if (orden.crear.clase === 'deuda' || orden.crear.clase === 'hipoteca') {
        const tipo = orden.crear.clase === 'hipoteca' ? 'mortgage' : 'other'
        await cliente.query(
          `insert into liabilities (id, user_id, name, type, balance, currency, institution, source, is_current)
           values ($1,$2,$3,$4,$5,'EUR',$6,'manual',true)`,
          [id, userId, orden.crear.nombre, tipo, orden.crear.valor, orden.crear.institucion],
        )
      } else {
        await cliente.query(
          `insert into assets (id, user_id, name, type, quantity, manual_value, currency, institution, source, read_only, is_liquid, metadata)
           values ($1,$2,$3,$4,1,$5,'EUR',$6,'manual',false,$7,'{}'::jsonb)`,
          [
            id,
            userId,
            orden.crear.nombre,
            orden.crear.tipoActivo,
            orden.crear.valor,
            orden.crear.institucion,
            orden.crear.clase === 'cash',
          ],
        )
      }
      orden.resultado.posicion = { ...orden.resultado.posicion, id }
    } else if (orden.minusvalia) {
      await cliente.query(
        `insert into minusvalias_pendientes (user_id, anio, importe, compensado)
         values ($1, $2::int, $3::numeric, $4::numeric)
         on conflict (user_id, anio) do update set
           importe = excluded.importe,
           compensado = excluded.compensado,
           updated_at = now()`,
        [userId, orden.minusvalia.anio, orden.minusvalia.importe, orden.minusvalia.compensado],
      )
    }
    await cliente.query('insert into agente_escrituras (clave, herramienta, resultado) values ($1,$2,$3::jsonb)', [
      orden.clave,
      nombre,
      JSON.stringify(orden.resultado),
    ])
    await cliente.query('commit')
    await guardarFoto(cliente, userId, fotoDeOrden(orden, posiciones))
    return orden.resultado
  } catch (err) {
    await cliente.query('rollback')
    throw err
  }
}

function ordenPosicionMetadata(posiciones, id) {
  return posiciones.find((p) => p.id === id)?.metadata ?? {}
}

function notasDe(posiciones, id) {
  const notes = posiciones.find((p) => p.id === id)?.notes
  return typeof notes === 'string' ? notes : null
}

function precio(posiciones, id, valor) {
  const unit = precioUnitario(valor, participacionesDe(posiciones.find((p) => p.id === id)))
  return unit == null ? {} : { pricePerUnit: unit }
}

async function escribirDetalle(cliente, userId, posiciones, orden) {
  const notes = notasConParche(notasDe(posiciones, orden.id), orden.notas)
  const c = orden.columnas
  if (orden.kind === 'liability') {
    const hecho = await cliente.query(
      `update liabilities
          set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
              notes = $2,
              institution = case when $3::boolean then $4::text else institution end,
              monthly_payment = case when $5::boolean then $6::numeric else monthly_payment end,
              interest_rate = case when $7::boolean then $8::numeric else interest_rate end,
              end_date = case when $9::boolean then $10::date else end_date end,
              updated_at = now()
        where id = $11 and user_id = $12
          and coalesce(source, '') <> 'finca'
          and coalesce(institution, '') <> 'finca'`,
      [
        JSON.stringify(orden.metadata),
        notes,
        c.institution != null,
        c.institution ?? null,
        c.monthlyPayment != null,
        c.monthlyPayment ?? null,
        c.interestRate != null,
        c.interestRate ?? null,
        c.endDate != null,
        c.endDate ?? null,
        orden.id,
        userId,
      ],
    )
    if ((hecho.rowCount ?? 0) === 0) throw new PatrimonioError('No se ha podido actualizar esa deuda.')
    return
  }
  const hecho = await cliente.query(
    `update assets
        set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb,
            notes = $2,
            institution = case when $3::boolean then $4::text else institution end,
            quantity = case when $5::boolean then $6::numeric else quantity end,
            purchase_price = case when $7::boolean then $8::numeric else purchase_price end,
            purchase_date = case when $9::boolean then $10::date else purchase_date end,
            updated_at = now()
      where id = $11 and user_id = $12
        and coalesce(source, '') <> 'finca'
        and read_only is not true
        and coalesce(institution, '') <> 'finca'`,
    [
      JSON.stringify(orden.metadata),
      notes,
      c.institution != null,
      c.institution ?? null,
      c.quantity != null,
      c.quantity ?? null,
      c.purchasePrice != null,
      c.purchasePrice ?? null,
      c.purchaseDate != null,
      c.purchaseDate ?? null,
      orden.id,
      userId,
    ],
  )
  if ((hecho.rowCount ?? 0) === 0) throw new PatrimonioError('No se ha podido actualizar esa posición.')
}

const SQL_FOTO = `insert into position_snapshots (user_id, position_id, kind, fecha, valor, participaciones, precio_por_participacion)
values ($1, $2, $3, (timezone('Europe/Madrid', now()))::date, $4::numeric, $5::numeric, $6::numeric)
on conflict (user_id, position_id, fecha) do update set
  valor = excluded.valor,
  participaciones = excluded.participaciones,
  precio_por_participacion = excluded.precio_por_participacion,
  kind = excluded.kind`

const SQL_SERIE = `select position_id, kind, fecha::text as fecha, valor, participaciones, precio_por_participacion
from position_snapshots
where user_id = $1 and fecha <= $2::date
  and ($3::uuid is null or position_id = $3::uuid)
order by fecha`

function numeroFoto(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function fotoDeOrden(orden, posiciones) {
  if (orden.crear) {
    const id = orden.resultado?.posicion?.id
    const valor = numeroFoto(orden.crear.valor)
    if (!id || valor == null) return null
    const kind = orden.crear.clase === 'deuda' || orden.crear.clase === 'hipoteca' ? 'liability' : 'asset'
    return { id, kind, valor, participaciones: null, precio: null }
  }
  const posicion = posiciones.find((p) => p.id === orden.id)
  const valor = numeroFoto(orden.detalle ? posicion?.valor : orden.valor)
  if (!orden.id || valor == null) return null
  const enviadas =
    orden.detalle && orden.metadata && Object.prototype.hasOwnProperty.call(orden.metadata, 'participaciones')
  const shares = numeroFoto(enviadas ? orden.metadata.participaciones : participacionesDe(posicion))
  const participaciones = shares != null && shares > 0 ? shares : null
  const precio = participaciones != null ? (precioUnitario(valor, participaciones) ?? null) : null
  return { id: orden.id, kind: orden.kind === 'liability' ? 'liability' : 'asset', valor, participaciones, precio }
}

async function guardarFoto(cliente, userId, foto) {
  if (!foto) return
  try {
    await cliente.query(SQL_FOTO, [userId, foto.id, foto.kind, foto.valor, foto.participaciones, foto.precio])
  } catch (err) {
    console.error('No se ha guardado la foto del día.', mensajeSeguro(err))
  }
}

async function leerEvolucion(cliente, userId, args) {
  const posiciones = await posicionesDe(cliente, userId)
  const plan = planEvolucion(args, posiciones, fechaMadrid())
  const filas = await cliente.query(SQL_SERIE, [userId, plan.hasta, plan.posicionId])
  const puntos = filas.rows.map((fila) => ({
    position_id: fila.position_id,
    kind: fila.kind,
    fecha: String(fila.fecha).slice(0, 10),
    valor: Number(fila.valor),
    participaciones: fila.participaciones == null ? null : Number(fila.participaciones),
    precioPorParticipacion: fila.precio_por_participacion == null ? null : Number(fila.precio_por_participacion),
  }))
  const crudo = plan.posicionId ? puntos : netoDiario(puntos, plan.hasta)
  const evo = evolucionDe(crudo, { desde: plan.desde, hasta: plan.hasta })
  return {
    posicion: plan.posicion ? { id: plan.posicion.id, nombre: plan.posicion.nombre } : null,
    desde: plan.desde ?? evo.serie[0]?.fecha ?? plan.hasta,
    hasta: plan.hasta,
    serie: evo.serie,
    variacion: evo.variacion,
  }
}

async function ejecutar(cliente, userId, nombre, args) {
  if (nombre === 'patrimonio') {
    const fila = await cliente.query('select patrimonio_ia() as snap')
    return sinSecretos(fila.rows[0]?.snap ?? {})
  }
  if (nombre === 'posiciones') {
    const posiciones = await posicionesDe(cliente, userId)
    const fichas = posiciones.map(fichaPublica)
    const filas = await cliente.query(
      'select anio, importe, compensado from minusvalias_pendientes where user_id = $1 order by anio',
      [userId],
    )
    const fiscal = resumenMinusvalias(
      filas.rows.map((fila) => ({
        anio: Number(fila.anio),
        importe: Number(fila.importe),
        compensado: Number(fila.compensado),
      })),
      Number(fechaMadrid().slice(0, 4)),
    )
    return {
      posiciones: fichas,
      plusvaliaTotal: totalPlusvalias(fichas),
      minusvalias: fiscal.minusvalias,
      avisos: fiscal.avisos,
    }
  }
  if (nombre === 'evolucion') return leerEvolucion(cliente, userId, args)
  if (esEscritura(nombre)) return aplicar(cliente, userId, nombre, args)
  throw new PatrimonioError(`No existe la herramienta "${nombre}".`)
}

function esRpc(body) {
  return !!body && typeof body === 'object' && ('jsonrpc' in body || 'method' in body)
}

export default async function handler(req, res) {
  cargarEnv()
  const token = process.env.FYM_MCP_TOKEN ?? ''
  if (!token) return enviar(res, 503, { error: 'El servidor no tiene token.' })
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  const autorizacion = req.headers.authorization
  if (!tokenValido(Array.isArray(autorizacion) ? autorizacion[0] : autorizacion, token)) {
    return enviar(res, 401, { error: 'Token inválido.' })
  }
  if (req.method === 'GET') {
    return enviar(res, 200, { lectura: true, escritura: true, herramientas })
  }
  if (req.method !== 'POST') return enviar(res, 405, { error: 'Usa GET o POST.' })

  let body
  try {
    body = await leerCuerpo(req)
  } catch {
    return enviar(res, 400, { error: 'La petición no es JSON válido.' })
  }

  try {
    const respuesta = await conCliente(async (cliente) => {
      const userId = await usuarioDe(cliente)
      if (body && typeof body === 'object' && 'herramienta' in body && !esRpc(body)) {
        return ejecutar(cliente, userId, body.herramienta, body.argumentos)
      }
      const method = body?.method
      const id = body?.id ?? null
      if (method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'fuckyoumoney', version: '0.1.0' },
            instructions:
              'Patrimonio declarado de Jose. patrimonio, posiciones y evolucion leen. posiciones incluye la plusvalía latente por posición y el total. evolucion devuelve la serie diaria y el porcentaje, y no escribe. fijar_valor, fijar_detalle, crear_posicion y fijar_minusvalia no guardan nada sin confirmar:true y una clave. fijar_detalle solo cambia los campos enviados. fijar_minusvalia apunta la pérdida de un año. Los inmuebles de Finca no se editan aquí.',
          },
        }
      }
      if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null
      if (method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, inputSchema: h.argumentos })),
          },
        }
      }
      if (method === 'tools/call') {
        const datos = await ejecutar(cliente, userId, body?.params?.name, body?.params?.arguments)
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }] } }
      }
      return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
    })
    if (respuesta == null) {
      res.writeHead(202, CORS)
      res.end()
      return
    }
    return enviar(res, 200, respuesta)
  } catch (err) {
    if (err instanceof PatrimonioError) return enviar(res, 400, { error: err.message })
    return enviar(res, 500, { error: mensajeSeguro(err) })
  }
}
