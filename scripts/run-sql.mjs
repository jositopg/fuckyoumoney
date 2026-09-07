// SQL contra Postgres FYM. DATABASE_URL en ~/.fuckyoumoney-db.env (chmod 600).
// Uso: node scripts/run-sql.mjs "<SQL>" | archivo.sql

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'

function loadDbEnv() {
  const path = join(homedir(), '.fuckyoumoney-db.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

async function main() {
  loadDbEnv()
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('Falta DATABASE_URL en ~/.fuckyoumoney-db.env')

  const arg = process.argv[2]
  if (!arg) throw new Error('Uso: node scripts/run-sql.mjs "<SQL>" | archivo.sql')
  const sql = existsSync(arg) ? readFileSync(arg, 'utf8') : arg

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const res = await client.query(sql)
    const results = Array.isArray(res) ? res : [res]
    for (const r of results) {
      if (r.rows?.length) console.table(r.rows)
      else console.log(`OK (${r.command}, ${r.rowCount ?? 0} filas)`)
    }
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
