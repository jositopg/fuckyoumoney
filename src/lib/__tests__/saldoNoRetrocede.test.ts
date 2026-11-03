import { act, renderHook } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error La API es JavaScript; el tsconfig de la app no incluye allowJs.
import patrimonioHandler from '../../../api/patrimonio.js'
// @ts-expect-error La API es JavaScript; el tsconfig de la app no incluye allowJs.
import syncFincaHandler from '../../../api/sync-finca.js'
import { usePersistentStorage } from '../../hooks/usePersistentStorage'
import type { Asset, StocksMetadata } from '../../types'
import { parseEur, setAssetValue } from '../../utils/declaredValue'
import { replaceFincaAssets, syncFincaFromApi } from '../fincaSync'
import {
  listCloudAssets,
  migrateLocalToSupabaseIfNeeded,
  pushLocalAssetsToCloud,
  updateCloudAsset,
} from '../supabaseData'
import { mergeCloudAndLocal } from '../supabaseMapper'

/**
 * Supabase y Postgres en memoria. El test no abre red: el cliente pg
 * ignora la cadena de conexión y no llama a connect de verdad.
 */
const banco = vi.hoisted(() => {
  type Fila = Record<string, unknown>
  interface Filtro {
    col: string
    kind: 'eq' | 'in'
    value: unknown
  }
  interface Operacion {
    op: 'update' | 'insert' | 'upsert' | 'delete'
    table: string
    filters: Filtro[]
    ids: string[]
    types: string[]
  }
  interface Respuesta {
    data: unknown
    error: { message: string } | null
    count: number | null
  }
  interface Consulta {
    rows: Fila[]
    rowCount: number
  }

  const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const CUENTA = '11111111-1111-4111-8111-111111111111'
  const DEUDA = '22222222-2222-4222-8222-222222222222'
  const FONDO = '33333333-3333-4333-8333-333333333333'
  const PISO = '44444444-4444-4444-8444-444444444444'
  const PISO_VIEJO = '55555555-5555-4555-8555-555555555555'

  const assets: Fila[] = []
  const liabilities: Fila[] = []
  const escritos = new Map<string, { resultado: unknown }>()
  const ops: Operacion[] = []
  const sql: string[] = []
  let foto: { assets: Fila[]; liabilities: Fila[]; escritos: [string, { resultado: unknown }][] } | null = null

  const snapshot = {
    source: 'finca' as const,
    asOf: '2026-11-02T20:00:00.000Z',
    currency: 'EUR' as const,
    scope: 'jose',
    gaps: [] as string[],
    totals: {
      propertyCount: 1,
      grossMarketValue: 200000,
      cadastralValue: 0,
      valueCoverage: { withMarket: 1, withCadastralOnly: 0, missing: 0 },
      mortgageOutstanding: null,
      equity: 200000,
      monthlyContractedRent: 800,
      occupancy: { rented: 1, vacant: 0, renovation: 0, forSale: 0, ownerUse: 0, rate: 1 },
    },
    properties: [
      {
        id: PISO,
        name: 'Piso prueba',
        type: 'piso',
        status: 'alquilado',
        municipio: 'Madrid',
        ownershipPct: 100,
        grossValue: 200000,
        valueSource: 'mercado' as const,
        ownerShareValue: 200000,
        monthlyContractedRent: 800,
        occupied: true,
        ttmNetCashflow: 5000,
      },
    ],
  }

  function tablas(nombre: string): Fila[] {
    if (nombre === 'assets') return assets
    if (nombre === 'liabilities') return liabilities
    throw new Error(`tabla no simulada: ${nombre}`)
  }

  function clonar<T>(valor: T): T {
    return structuredClone(valor)
  }

  function coincide(fila: Fila, filtros: Filtro[]): boolean {
    return filtros.every(filtro => {
      if (filtro.kind === 'eq') return fila[filtro.col] === filtro.value
      return Array.isArray(filtro.value) && filtro.value.includes(fila[filtro.col])
    })
  }

  function consulta(nombre: string) {
    let accion: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select'
    let carga: Fila | Fila[] | null = null
    const filtros: Filtro[] = []
    let head = false
    let conConteo = false
    let ordenCol: string | null = null

    function ejecutar(modo: 'many' | 'maybe' | 'one'): Respuesta {
      const filas = tablas(nombre)
      if (accion === 'select') {
        let hits = filas.filter(fila => coincide(fila, filtros))
        if (ordenCol) {
          const col = ordenCol
          hits = [...hits].sort((a, b) => String(a[col]).localeCompare(String(b[col])))
        }
        if (head) return { data: null, error: null, count: hits.length }
        if (modo === 'many') return { data: clonar(hits), error: null, count: conConteo ? hits.length : null }
        const fila = hits[0]
        if (!fila && modo === 'one') return { data: null, error: { message: 'ninguna fila' }, count: null }
        return { data: fila ? clonar(fila) : null, error: null, count: null }
      }
      if (accion === 'delete') {
        const ids = filas.filter(fila => coincide(fila, filtros)).map(fila => String(fila.id))
        const quedan = filas.filter(fila => !coincide(fila, filtros))
        filas.splice(0, filas.length, ...quedan)
        ops.push({ op: 'delete', table: nombre, filters: [...filtros], ids, types: [] })
        return { data: null, error: null, count: null }
      }
      if (accion === 'update') {
        const hits = filas.filter(fila => coincide(fila, filtros))
        ops.push({
          op: 'update',
          table: nombre,
          filters: [...filtros],
          ids: hits.map(fila => String(fila.id)),
          types: hits.map(fila => String(fila.type ?? '')),
        })
        if (hits.length === 0) return { data: null, error: null, count: null }
        const parche = carga && !Array.isArray(carga) ? carga : {}
        for (const fila of hits) Object.assign(fila, parche)
        if (modo === 'many') return { data: clonar(hits), error: null, count: null }
        return { data: clonar(hits[0]), error: null, count: null }
      }
      const entradas = Array.isArray(carga) ? carga : carga ? [carga] : []
      const guardadas: Fila[] = []
      for (const entrada of entradas) {
        if (accion === 'upsert') {
          const idx = filas.findIndex(fila => fila.id === entrada.id)
          if (idx >= 0) {
            Object.assign(filas[idx], entrada)
            guardadas.push(filas[idx])
            continue
          }
        }
        filas.push(entrada)
        guardadas.push(entrada)
      }
      ops.push({
        op: accion,
        table: nombre,
        filters: [...filtros],
        ids: guardadas.map(fila => String(fila.id)),
        types: guardadas.map(fila => String(fila.type ?? '')),
      })
      if (modo === 'many') return { data: clonar(guardadas), error: null, count: null }
      if (!guardadas[0]) return { data: null, error: { message: 'ninguna fila' }, count: null }
      return { data: clonar(guardadas[0]), error: null, count: null }
    }

    const api = {
      select(cols?: string, opciones?: { count?: string; head?: boolean }) {
        void cols
        if (opciones?.head) head = true
        if (opciones?.count) conConteo = true
        return api
      },
      update(parche: Fila) {
        accion = 'update'
        carga = parche
        return api
      },
      insert(rows: Fila | Fila[]) {
        accion = 'insert'
        carga = rows
        return api
      },
      upsert(rows: Fila | Fila[]) {
        accion = 'upsert'
        carga = rows
        return api
      },
      delete() {
        accion = 'delete'
        return api
      },
      eq(col: string, value: unknown) {
        filtros.push({ col, kind: 'eq', value })
        return api
      },
      in(col: string, value: unknown[]) {
        filtros.push({ col, kind: 'in', value })
        return api
      },
      order(col: string) {
        ordenCol = col
        return api
      },
      maybeSingle() {
        return Promise.resolve(ejecutar('maybe'))
      },
      single() {
        return Promise.resolve(ejecutar('one'))
      },
      then<T>(
        onFulfilled: (value: Respuesta) => T | PromiseLike<T>,
        onRejected?: (reason: unknown) => T | PromiseLike<T>,
      ) {
        return Promise.resolve(ejecutar('many')).then(onFulfilled, onRejected)
      },
    }
    return api
  }

  const supabase = {
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'sesion-de-test' } }, error: null }
      },
      async getUser() {
        return { data: { user: { id: USER } }, error: null }
      },
    },
    from(nombre: string) {
      return consulta(nombre)
    },
  }

  function valorDe(fila: Fila): number {
    const manual = Number(fila.manual_value ?? 0)
    if (manual !== 0) return manual
    return Number(fila.quantity ?? 0) * Number(fila.purchase_price ?? 0)
  }

  function filasPosiciones(): Fila[] {
    const deActivos = assets.map(fila => ({
      id: fila.id,
      user_id: fila.user_id,
      name: fila.name,
      clase: fila.type,
      kind: 'asset',
      valor: valorDe(fila),
      source: fila.source ?? null,
      institution: fila.institution ?? null,
      read_only: fila.read_only === true,
      metadata: fila.metadata ?? {},
      notes: fila.notes ?? null,
      quantity: fila.quantity ?? null,
      monthly_payment: null,
      interest_rate: null,
      end_date: null,
      purchase_date: fila.purchase_date ?? null,
      purchase_price: fila.purchase_price ?? null,
    }))
    const deDeudas = liabilities.map(fila => ({
      id: fila.id,
      user_id: fila.user_id,
      name: fila.name,
      clase: fila.type,
      kind: 'liability',
      valor: Number(fila.balance ?? 0),
      source: fila.source ?? null,
      institution: fila.institution ?? null,
      read_only: false,
      metadata: fila.metadata ?? {},
      notes: fila.notes ?? null,
      quantity: null,
      monthly_payment: fila.monthly_payment ?? null,
      interest_rate: fila.interest_rate ?? null,
      end_date: fila.end_date ?? null,
      purchase_date: null,
      purchase_price: null,
    }))
    return [...deActivos, ...deDeudas]
  }

  function consultar(text: string, params: unknown[]): Consulta {
    const norm = text.replace(/\s+/g, ' ').trim().toLowerCase()
    sql.push(norm)
    if (norm === 'begin') {
      foto = { assets: clonar(assets), liabilities: clonar(liabilities), escritos: [...escritos.entries()] }
      return { rows: [], rowCount: 0 }
    }
    if (norm === 'commit') {
      foto = null
      return { rows: [], rowCount: 0 }
    }
    if (norm === 'rollback') {
      if (foto) {
        assets.splice(0, assets.length, ...foto.assets)
        liabilities.splice(0, liabilities.length, ...foto.liabilities)
        escritos.clear()
        for (const [clave, escrito] of foto.escritos) escritos.set(clave, escrito)
        foto = null
      }
      return { rows: [], rowCount: 0 }
    }
    if (norm.startsWith('create table')) return { rows: [], rowCount: 0 }
    if (norm.includes('from profiles')) return { rows: [{ id: USER }], rowCount: 1 }
    if (norm.includes('patrimonio_macro_snapshot')) return { rows: [{ snap: snapshot }], rowCount: 1 }
    if (norm.startsWith('select resultado from agente_escrituras')) {
      const escrito = escritos.get(String(params[0]))
      return { rows: escrito ? [{ resultado: escrito.resultado }] : [], rowCount: escrito ? 1 : 0 }
    }
    if (norm.startsWith('insert into agente_escrituras')) {
      const resultado = typeof params[2] === 'string' ? (JSON.parse(params[2]) as unknown) : params[2]
      escritos.set(String(params[0]), { resultado })
      return { rows: [], rowCount: 1 }
    }
    if (norm.startsWith('update assets') && norm.includes('manual_value')) {
      const id = String(params[2])
      const userId = String(params[3])
      const fila = assets.find(item => item.id === id && item.user_id === userId)
      const bloqueada =
        !fila || fila.source === 'finca' || fila.read_only === true || fila.institution === 'finca'
      if (!fila || bloqueada) return { rows: [], rowCount: 0 }
      fila.manual_value = Number(params[0])
      fila.metadata = typeof params[1] === 'string' ? (JSON.parse(params[1]) as unknown) : params[1]
      if (params.length >= 5) fila.notes = params[4]
      if (Number(params[0]) === 0) fila.purchase_price = 0
      fila.updated_at = new Date().toISOString()
      return { rows: [], rowCount: 1 }
    }
    if (norm.startsWith('update liabilities') && norm.includes('balance')) {
      const fila = liabilities.find(item => item.id === params[1] && item.user_id === params[2])
      if (!fila || fila.source === 'finca' || fila.institution === 'finca') return { rows: [], rowCount: 0 }
      fila.balance = Number(params[0])
      fila.updated_at = new Date().toISOString()
      return { rows: [], rowCount: 1 }
    }
    if (norm.includes('from assets a') || norm.includes('as clase')) {
      const rows = filasPosiciones()
      return { rows, rowCount: rows.length }
    }
    throw new Error(`SQL no simulado: ${norm.slice(0, 80)}`)
  }

  class Cliente {
    connect() {
      return Promise.resolve()
    }
    end() {
      return Promise.resolve()
    }
    query(text: string, params?: unknown[]) {
      return Promise.resolve(consultar(text, params ?? []))
    }
  }

  function reset() {
    assets.splice(0, assets.length)
    liabilities.splice(0, liabilities.length)
    escritos.clear()
    ops.splice(0, ops.length)
    sql.splice(0, sql.length)
    foto = null
  }

  function fila(tabla: 'assets' | 'liabilities', id: string): Fila {
    const encontrada = tablas(tabla).find(item => item.id === id)
    if (!encontrada) throw new Error(`no está ${tabla}.${id}`)
    return encontrada
  }

  return { USER, CUENTA, DEUDA, FONDO, PISO, PISO_VIEJO, assets, liabilities, ops, sql, supabase, Cliente, reset, fila, snapshot }
})

vi.mock('../supabase', () => ({ supabase: banco.supabase, isSupabaseConfigured: true }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => banco.supabase }))
vi.mock('pg', () => {
  const pg = { Client: banco.Cliente, types: { setTypeParser() {} } }
  return { default: pg, Client: pg.Client, types: pg.types }
})

const SALDO = parseEur('12.345,67')
const LEIDO = '2026-11-02T18:00:00.000Z'
const NUBE = '2026-11-02T19:30:00.000Z'
const VIEJO = '2026-09-08T00:00:00.000Z'
const AHORA = '2026-11-02T19:00:00.000Z'
const ENV_CLAVES = [
  'DATABASE_URL',
  'FYM_MCP_TOKEN',
  'FINCA_DATABASE_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const
const envPrevio = new Map<string, string | undefined>()

function entorno(): Record<string, string | undefined> {
  return (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
}

type Handler = (
  req: { method: string; headers: Record<string, string>; body?: unknown },
  res: RespuestaHttp,
) => Promise<void>

const patrimonio = patrimonioHandler as unknown as Handler
const syncFinca = syncFincaHandler as unknown as Handler

interface RespuestaHttp {
  codigo: number
  cuerpo: unknown
  writeHead(codigo: number): void
  end(payload?: string): void
  setHeader(clave: string, valor: string): void
  status(codigo: number): { json(data: unknown): void; end(): void }
}

interface PosicionLeida {
  nombre: string
  valor: number
  precioPorParticipacion?: number
}

interface CuerpoPatrimonio {
  escrito?: boolean
  repetida?: boolean
  error?: string
  posiciones?: PosicionLeida[]
  posicion?: { valor: number }
}

function crearRespuesta(): RespuestaHttp {
  const res: RespuestaHttp = {
    codigo: 200,
    cuerpo: undefined,
    writeHead(codigo) {
      res.codigo = codigo
    },
    end(payload) {
      if (payload) res.cuerpo = JSON.parse(payload) as unknown
    },
    setHeader() {},
    status(codigo) {
      res.codigo = codigo
      return {
        json(data) {
          res.cuerpo = data
        },
        end() {},
      }
    },
  }
  return res
}

function filaBase(parcial: Record<string, unknown>): Record<string, unknown> {
  return {
    user_id: banco.USER,
    ticker: null,
    ticker_source: null,
    quantity: 1,
    purchase_price: null,
    purchase_date: null,
    currency: 'EUR',
    country: null,
    notes: null,
    is_liquid: true,
    source: 'manual',
    read_only: false,
    metadata: {},
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: NUBE,
    ...parcial,
  }
}

function sembrarCuenta(valor: number, updatedAt = NUBE) {
  banco.assets.push(
    filaBase({
      id: banco.CUENTA,
      name: 'Cuenta prueba',
      type: 'cash',
      manual_value: valor,
      institution: 'corriente',
      updated_at: updatedAt,
    }),
  )
}

function sembrarFondo(valor: number, updatedAt = LEIDO) {
  banco.assets.push(
    filaBase({
      id: banco.FONDO,
      name: 'Fondo prueba',
      type: 'etf',
      quantity: 10,
      manual_value: valor,
      institution: 'ING',
      is_liquid: true,
      notes: 'FYM1:' + JSON.stringify({ participaciones: 10, assetType: 'etf' }),
      updated_at: updatedAt,
    }),
  )
}

function sembrarDeuda(balance: number, updatedAt = NUBE) {
  banco.liabilities.push({
    id: banco.DEUDA,
    user_id: banco.USER,
    name: 'Préstamo prueba',
    type: 'personal_loan',
    balance,
    interest_rate: null,
    monthly_payment: null,
    end_date: null,
    currency: 'EUR',
    notes: null,
    is_current: true,
    institution: null,
    source: 'manual',
    metadata: {},
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: updatedAt,
  })
}

function metadataDe(fila: Record<string, unknown>): Record<string, unknown> {
  const meta = fila.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) return meta as Record<string, unknown>
  return {}
}

async function postPatrimonio(body: unknown): Promise<{ codigo: number; cuerpo: CuerpoPatrimonio }> {
  const res = crearRespuesta()
  await patrimonio(
    {
      method: 'POST',
      headers: { authorization: `Bearer ${entorno().FYM_MCP_TOKEN ?? ''}` },
      body,
    },
    res,
  )
  return { codigo: res.codigo, cuerpo: (res.cuerpo ?? {}) as CuerpoPatrimonio }
}

function cabeceras(init?: RequestInit): Record<string, string> {
  const origen = init?.headers
  if (!origen || Array.isArray(origen)) return {}
  const salida: Record<string, string> = {}
  if (origen instanceof Headers) {
    origen.forEach((valor, clave) => {
      salida[clave.toLowerCase()] = valor
    })
    return salida
  }
  for (const [clave, valor] of Object.entries(origen)) {
    if (typeof valor === 'string') salida[clave.toLowerCase()] = valor
  }
  return salida
}

beforeAll(() => {
  const env = entorno()
  for (const clave of ENV_CLAVES) envPrevio.set(clave, env[clave])
  env.DATABASE_URL = 'postgres://regresion:regresion@127.0.0.1:9/postgres'
  env.FYM_MCP_TOKEN = 'token-de-test-local'
  env.FINCA_DATABASE_URL = 'postgres://regresion:regresion@127.0.0.1:9/finca'
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'
  env.SUPABASE_URL = 'http://127.0.0.1:9'
  env.VITE_SUPABASE_ANON_KEY = 'anon-de-test'
  env.SUPABASE_ANON_KEY = 'anon-de-test'
})

afterAll(() => {
  const env = entorno()
  for (const clave of ENV_CLAVES) {
    const previo = envPrevio.get(clave)
    if (previo === undefined) delete env[clave]
    else env[clave] = previo
  }
})

beforeEach(() => {
  banco.reset()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('un saldo guardado no vuelve a un valor viejo', () => {
  it('guarda 12.345,67 y al releerlo conserva el valor y un pricePerUnit coherente', async () => {
    expect(SALDO).toBe(12345.67)
    sembrarCuenta(100, LEIDO)
    sembrarFondo(1000, LEIDO)

    const leidas = await listCloudAssets(banco.USER)
    const cuenta = leidas.find(asset => asset.id === banco.CUENTA)
    const fondo = leidas.find(asset => asset.id === banco.FONDO)
    expect(cuenta?.updatedAt).toBe(LEIDO)
    expect(fondo).toBeTruthy()
    if (!cuenta || !fondo) return

    banco.ops.splice(0, banco.ops.length)
    const cuentaGuardada = await updateCloudAsset(
      setAssetValue(cuenta, SALDO, AHORA),
      banco.USER,
      cuenta.updatedAt,
    )
    const fondoPendiente = setAssetValue(fondo, SALDO, AHORA)
    const fondoGuardado = await updateCloudAsset(fondoPendiente, banco.USER, fondo.updatedAt)
    const precioAlGuardar = (fondoPendiente.metadata as StocksMetadata).pricePerUnit

    const releidas = await listCloudAssets(banco.USER)
    const cuentaReleida = releidas.find(asset => asset.id === banco.CUENTA)
    const fondoReleido = releidas.find(asset => asset.id === banco.FONDO)
    const filaCuenta = banco.fila('assets', banco.CUENTA)
    const filaFondo = banco.fila('assets', banco.FONDO)
    const precioReleido = (fondoReleido?.metadata as StocksMetadata | undefined)?.pricePerUnit

    expect(cuentaGuardada.value).toBe(SALDO)
    expect(cuentaReleida?.value).toBe(SALDO)
    expect(filaCuenta.manual_value).toBe(SALDO)
    expect(filaCuenta.quantity).toBe(1)
    expect(Number(filaCuenta.manual_value) / Number(filaCuenta.quantity)).toBe(SALDO)

    expect(fondoGuardado.value).toBe(SALDO)
    expect(fondoReleido?.value).toBe(SALDO)
    expect(precioAlGuardar).toBeCloseTo(SALDO / 10, 4)
    expect(precioReleido).toBeCloseTo(precioAlGuardar ?? NaN, 4)
    expect((precioReleido ?? 0) * Number(filaFondo.quantity)).toBeCloseTo(SALDO, 2)

    const escrituras = banco.ops.filter(op => op.table === 'assets' && (op.op === 'update' || op.op === 'upsert'))
    expect(escrituras.every(op => op.op === 'update')).toBe(true)
    expect(escrituras.some(op => op.filters.some(filtro => filtro.col === 'updated_at' && filtro.value === LEIDO))).toBe(
      true,
    )
    expect(banco.ops.some(op => op.op === 'upsert')).toBe(false)
  })

  it('un cliente con baseUpdatedAt antiguo no sobrescribe y devuelve la fila de la nube', async () => {
    sembrarCuenta(SALDO, NUBE)
    sembrarDeuda(5000, NUBE)
    const leidas = await listCloudAssets(banco.USER)
    const cuenta = leidas.find(asset => asset.id === banco.CUENTA)
    const deuda = leidas.find(asset => asset.id === banco.DEUDA)
    expect(cuenta).toBeTruthy()
    expect(deuda).toBeTruthy()
    if (!cuenta || !deuda) return

    const cuentaVieja: Asset = {
      ...cuenta,
      value: 1000,
      updatedAt: '2026-11-02T19:40:00.000Z',
      baseUpdatedAt: VIEJO,
      dirty: true,
    }
    const deudaVieja: Asset = {
      ...deuda,
      value: 9000,
      updatedAt: '2026-11-02T19:40:00.000Z',
      baseUpdatedAt: VIEJO,
      dirty: true,
    }

    let conflictoCuenta: unknown
    try {
      await updateCloudAsset(cuentaVieja, banco.USER, cuentaVieja.baseUpdatedAt)
    } catch (err) {
      conflictoCuenta = err
    }
    let conflictoDeuda: unknown
    try {
      await updateCloudAsset(deudaVieja, banco.USER, deudaVieja.baseUpdatedAt)
    } catch (err) {
      conflictoDeuda = err
    }

    expect(conflictoCuenta).toMatchObject({
      name: 'CloudConflictError',
      current: { id: banco.CUENTA, value: SALDO },
    })
    expect(conflictoDeuda).toMatchObject({
      name: 'CloudConflictError',
      current: { id: banco.DEUDA, value: 5000 },
    })
    expect(banco.fila('assets', banco.CUENTA).manual_value).toBe(SALDO)
    expect(banco.fila('liabilities', banco.DEUDA).balance).toBe(5000)

    const devueltas = await pushLocalAssetsToCloud([cuentaVieja, deudaVieja], banco.USER)
    expect(devueltas.find(asset => asset.id === banco.CUENTA)?.value).toBe(SALDO)
    expect(devueltas.find(asset => asset.id === banco.DEUDA)?.value).toBe(5000)
    expect(banco.fila('assets', banco.CUENTA).manual_value).toBe(SALDO)
    expect(banco.fila('liabilities', banco.DEUDA).balance).toBe(5000)
    expect(banco.fila('assets', banco.CUENTA).updated_at).toBe(NUBE)
  })

  it('migrateLocalToSupabaseIfNeeded con datos locales viejos deja ganar a la nube más reciente', async () => {
    sembrarCuenta(SALDO, NUBE)
    const localViejo: Asset = {
      id: banco.CUENTA,
      category: 'cash',
      name: 'Cuenta prueba',
      value: 1000,
      metadata: { accountType: 'corriente' },
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }

    const migracion = await migrateLocalToSupabaseIfNeeded([localViejo], banco.USER)
    expect(migracion.migrated).toBe(false)
    expect(migracion.cloudAssets.find(asset => asset.id === banco.CUENTA)?.value).toBe(SALDO)
    expect(banco.ops.some(op => op.op === 'insert' || op.op === 'upsert')).toBe(false)
    expect(banco.fila('assets', banco.CUENTA).manual_value).toBe(SALDO)

    // El cliente viejo adelanta updatedAt al abrir, pero no trae un cambio pendiente.
    const copiaSinPendiente: Asset = { ...localViejo, updatedAt: '2026-11-02T19:45:00.000Z' }
    const { merged, toUpsert } = mergeCloudAndLocal(migracion.cloudAssets, [copiaSinPendiente])
    expect(merged.find(asset => asset.id === banco.CUENTA)?.value).toBe(SALDO)
    expect(toUpsert).toEqual([])
    await pushLocalAssetsToCloud(toUpsert, banco.USER)
    expect(banco.fila('assets', banco.CUENTA).manual_value).toBe(SALDO)
  })

  it('fijar_valor confirmado se lee después y la misma clave no vuelve a escribir', async () => {
    sembrarCuenta(100, NUBE)
    const primera = await postPatrimonio({
      herramienta: 'fijar_valor',
      argumentos: { posicion: 'Cuenta prueba', valor: '12.345,67', confirmar: true, clave: 'saldo-nov-02' },
    })
    expect(primera.codigo).toBe(200)
    expect(primera.cuerpo.escrito).toBe(true)
    expect(primera.cuerpo.repetida).toBe(false)
    expect(primera.cuerpo.posicion?.valor).toBe(SALDO)

    const lectura = await postPatrimonio({ herramienta: 'posiciones', argumentos: {} })
    const posicion = lectura.cuerpo.posiciones?.find(item => item.nombre === 'Cuenta prueba')
    const fila = banco.fila('assets', banco.CUENTA)
    const meta = metadataDe(fila)
    expect(lectura.codigo).toBe(200)
    expect(posicion?.valor).toBe(SALDO)
    expect(posicion?.precioPorParticipacion).toBeUndefined()
    expect(fila.manual_value).toBe(SALDO)
    expect(fila.quantity).toBe(1)
    expect(Number(fila.manual_value) / Number(fila.quantity)).toBe(SALDO)
    expect(typeof meta.lastInterestUpdate).toBe('string')
    expect(String(fila.notes)).toContain('lastInterestUpdate')

    const updates = banco.sql.filter(texto => texto.startsWith('update assets')).length
    const segunda = await postPatrimonio({
      herramienta: 'fijar_valor',
      argumentos: { posicion: 'Cuenta prueba', valor: '1', confirmar: true, clave: 'saldo-nov-02' },
    })
    const lecturaFinal = await postPatrimonio({ herramienta: 'posiciones', argumentos: {} })
    const posicionFinal = lecturaFinal.cuerpo.posiciones?.find(item => item.nombre === 'Cuenta prueba')

    expect(segunda.codigo).toBe(200)
    expect(segunda.cuerpo.repetida).toBe(true)
    expect(segunda.cuerpo.posicion?.valor).toBe(SALDO)
    expect(posicionFinal?.valor).toBe(SALDO)
    expect(banco.fila('assets', banco.CUENTA).manual_value).toBe(SALDO)
    expect(banco.sql.filter(texto => texto.startsWith('update assets')).length).toBe(updates)
  })

  it('sincronizar Finca después no cambia el saldo manual', async () => {
    sembrarCuenta(100, NUBE)
    banco.assets.push(
      filaBase({
        id: banco.PISO_VIEJO,
        name: 'Piso que ya no está',
        type: 'real_estate',
        manual_value: 1,
        institution: 'finca',
        source: 'finca',
        read_only: true,
        is_liquid: false,
      }),
    )
    const fijado = await postPatrimonio({
      herramienta: 'fijar_valor',
      argumentos: { posicion: 'Cuenta prueba', valor: '12.345,67', confirmar: true, clave: 'saldo-sync-01' },
    })
    expect(fijado.codigo).toBe(200)
    expect(fijado.cuerpo.posicion?.valor).toBe(SALDO)
    const marca = metadataDe(banco.fila('assets', banco.CUENTA)).lastInterestUpdate
    expect(typeof marca).toBe('string')

    const res = crearRespuesta()
    await syncFinca({ method: 'POST', headers: { authorization: 'Bearer sesion-de-test' } }, res)
    expect(res.codigo).toBe(200)

    const trasSync = banco.fila('assets', banco.CUENTA)
    expect(trasSync.manual_value).toBe(SALDO)
    expect(metadataDe(trasSync).lastInterestUpdate).toBe(marca)
    expect(banco.assets.some(fila => fila.id === banco.PISO_VIEJO)).toBe(false)
    expect(banco.assets.some(fila => fila.id === banco.PISO && fila.type === 'real_estate')).toBe(true)
    const subidas = banco.ops.filter(op => op.op === 'upsert')
    expect(subidas.length).toBeGreaterThan(0)
    expect(subidas.every(op => op.types.every(tipo => tipo === 'real_estate'))).toBe(true)
    expect(subidas.every(op => !op.ids.includes(banco.CUENTA))).toBe(true)
    expect(banco.ops.filter(op => op.op === 'delete').every(op => !op.ids.includes(banco.CUENTA))).toBe(true)

    const locales = await listCloudAssets(banco.USER)
    const fetchPrevio = globalThis.fetch
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const http = crearRespuesta()
      await syncFinca({ method: 'POST', headers: cabeceras(init) }, http)
      return new Response(JSON.stringify(http.cuerpo ?? {}), { status: http.codigo })
    }
    try {
      const { assets: deFinca } = await syncFincaFromApi()
      const mezcla = replaceFincaAssets(locales, deFinca)
      expect(mezcla.find(asset => asset.id === banco.CUENTA)?.value).toBe(SALDO)
      expect(mezcla.some(asset => asset.category === 'real_estate' && asset.source === 'finca')).toBe(true)
    } finally {
      globalThis.fetch = fetchPrevio
    }

    const opsAntes = banco.ops.length
    renderHook(() => usePersistentStorage())
    await act(async () => {
      await Promise.resolve()
    })
    expect(banco.ops.length).toBe(opsAntes)
    expect(banco.fila('assets', banco.CUENTA).manual_value).toBe(SALDO)
    expect(metadataDe(banco.fila('assets', banco.CUENTA)).lastInterestUpdate).toBe(marca)
  })
})
