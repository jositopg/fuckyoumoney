import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ACTIVO = '11111111-1111-4111-8111-111111111111'

const memoria = vi.hoisted(() => {
  const sql = []
  const estado = {
    fila: null,
    columnas: [],
  }

  function consultar(text, params) {
    const norm = text.replace(/\s+/g, ' ').trim().toLowerCase()
    sql.push(norm)
    if (norm === 'begin' || norm === 'commit' || norm === 'rollback' || norm.startsWith('create table')) {
      return { rows: [], rowCount: 0 }
    }
    if (norm.includes('from profiles')) return { rows: [{ id: USER }], rowCount: 1 }
    if (norm.includes('information_schema.columns')) {
      return { rows: estado.columnas, rowCount: estado.columnas.length }
    }
    if (norm.startsWith('select *')) {
      const fila = estado.fila
      const vale = fila && fila.id === params[0] && fila.user_id === params[1]
      return { rows: vale ? [fila] : [], rowCount: vale ? 1 : 0 }
    }
    if (norm.startsWith('update ') || norm.startsWith('delete ') || norm.startsWith('insert into agente_escrituras')) {
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`SQL no simulado: ${norm.slice(0, 120)}`)
  }

  class Cliente {
    connect() {
      return Promise.resolve()
    }
    end() {
      return Promise.resolve()
    }
    query(text, params) {
      return Promise.resolve(consultar(text, params ?? []))
    }
  }

  return { sql, estado, Cliente }
})

vi.mock('pg', () => {
  const pg = { Client: memoria.Cliente, types: { setTypeParser() {} } }
  return { default: pg, Client: pg.Client, types: pg.types }
})

import handler from '../api/patrimonio.js'

const ENV_CLAVES = ['DATABASE_URL', 'FYM_MCP_TOKEN']
const envPrevio = new Map()

function entorno() {
  return globalThis.process.env
}

function escribio() {
  return memoria.sql.some(
    (sentencia) =>
      sentencia === 'begin' ||
      sentencia.startsWith('update ') ||
      sentencia.startsWith('delete ') ||
      sentencia.startsWith('insert '),
  )
}

function respuesta() {
  const res = {
    codigo: 200,
    cuerpo: undefined,
    writeHead(codigo) {
      res.codigo = codigo
    },
    end(payload) {
      if (payload) res.cuerpo = JSON.parse(payload)
    },
  }
  return res
}

async function post(body) {
  const res = respuesta()
  await handler(
    {
      method: 'POST',
      headers: { authorization: `Bearer ${entorno().FYM_MCP_TOKEN ?? ''}` },
      body,
    },
    res,
  )
  return { codigo: res.codigo, cuerpo: res.cuerpo ?? {} }
}

const COLUMNAS_ACTIVO = [
  { column_name: 'id', udt_name: 'uuid' },
  { column_name: 'user_id', udt_name: 'uuid' },
  { column_name: 'created_at', udt_name: 'timestamptz' },
  { column_name: 'is_liquid', udt_name: 'bool' },
  { column_name: 'manual_value', udt_name: 'numeric' },
  { column_name: 'source', udt_name: 'text' },
  { column_name: 'read_only', udt_name: 'bool' },
  { column_name: 'institution', udt_name: 'text' },
]

beforeAll(() => {
  const env = entorno()
  for (const clave of ENV_CLAVES) envPrevio.set(clave, env[clave])
  env.DATABASE_URL = 'postgres://regresion:regresion@127.0.0.1:9/postgres'
  env.FYM_MCP_TOKEN = 'token-de-test-local'
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
  memoria.sql.length = 0
  memoria.estado.columnas = COLUMNAS_ACTIVO
  memoria.estado.fila = {
    id: ACTIVO,
    user_id: USER,
    is_liquid: false,
    manual_value: 10,
    source: 'manual',
    read_only: false,
    institution: 'corriente',
  }
})

describe('corregir un registro', () => {
  it('una tabla fuera de la lista falla', async () => {
    const editar = await post({
      herramienta: 'editar_registro',
      argumentos: { tabla: 'inquilinos', id: ACTIVO, campos: { name: 'Ana' } },
    })
    const borrar = await post({
      herramienta: 'borrar_registro',
      argumentos: { tabla: 'inquilinos', id: ACTIVO },
    })
    expect(editar.codigo).toBe(400)
    expect(editar.cuerpo.error).toMatch(/no es una tabla/)
    expect(borrar.codigo).toBe(400)
    expect(borrar.cuerpo.error).toMatch(/no es una tabla/)
    expect(escribio()).toBe(false)
  })

  it('la columna user_id falla', async () => {
    const respuestaHttp = await post({
      herramienta: 'editar_registro',
      argumentos: { tabla: 'assets', id: ACTIVO, campos: { user_id: USER } },
    })
    expect(respuestaHttp.codigo).toBe(400)
    expect(respuestaHttp.cuerpo.error).toMatch(/user_id/)
    expect(escribio()).toBe(false)
  })

  it('sin confirmar no escribe', async () => {
    const respuestaHttp = await post({
      herramienta: 'editar_registro',
      argumentos: { tabla: 'assets', id: ACTIVO, campos: { manual_value: 20 } },
    })
    expect(respuestaHttp.codigo).toBe(200)
    expect(escribio()).toBe(false)
    expect(respuestaHttp.cuerpo).toMatchObject({
      escrito: false,
      vistaPrevia: true,
      tabla: 'assets',
      id: ACTIVO,
      antes: { manual_value: 10 },
      despues: { manual_value: 20 },
    })
  })

  it('is_liquid true en assets aparece en la vista previa', async () => {
    const respuestaHttp = await post({
      herramienta: 'editar_registro',
      argumentos: { tabla: 'assets', id: ACTIVO, campos: { is_liquid: true } },
    })
    expect(respuestaHttp.codigo).toBe(200)
    expect(escribio()).toBe(false)
    expect(respuestaHttp.cuerpo.vistaPrevia).toBe(true)
    expect(respuestaHttp.cuerpo.despues.is_liquid).toBe(true)
    expect(respuestaHttp.cuerpo.antes.is_liquid).toBe(false)
  })
})
