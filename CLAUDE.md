# Fuck You Money

> Actualiza este archivo en el mismo commit si cambia el modelo de datos, una vista, una convención o una limitación. Foto del estado actual, no diario.

App personal de Jose para **anotar y ver su patrimonio**: un número (neto), asignación, lista de posiciones. **No gestiona** inmuebles (eso es Finca). Sin chat IA, sin pedagogía de libro. Uso exclusivo, datos reales.

Repo `jositopg/fuckyoumoney`, Vercel: `https://fuckyoumoney.vercel.app`.  
Handoff: `HANDOFF.md`. Schema para Grok: `supabase/README.md`.

## Stack

React 19 + TypeScript + Vite + Tailwind. PWA. Auth: Supabase email/password. DB: Supabase Postgres (`jwcrrnevvtxaycsqjmem`, distinto de Finca).

- `npm run dev` / `npm test` / `npm run build`
- `npm run wealth` — briefing JSON para hablar del patrimonio en esta terminal
- Serverless: `api/sync-finca.js` (ingesta inmuebles). **No hay chat IA en la app.**
- SQL: `supabase/migrations/001_wealth_os.sql` con `~/.fuckyoumoney-db.env`

## Roles vs Finca

| App | Rol |
|---|---|
| Finca | Operación inmobiliaria. Publica `patrimonio_macro_snapshot()`. |
| FYM | Balance consolidado. Inmuebles **read-only** (`source=finca`). Resto de clases se editan aquí. Hipotecas (principal) viven aquí. |

## Grok u otra IA (no en la app)

No hay chat embebido. Cualquier IA con acceso a este Postgres:

```sql
SELECT * FROM ai_guide ORDER BY sort;
SELECT patrimonio_ia();
```

En la terminal de Jose:

```bash
cd ~/Proyectos/fuck-you-money && node scripts/dump-wealth.mjs
```

Contrato: `supabase/README.md`. Migración: `supabase/migrations/001_wealth_os.sql`.

## Modelo local (`src/types.ts`)

`Asset` es el modelo de UI. `category: debt` son pasivos (valor positivo, se resta en `getNetWorth`).  
Campos extra: `source` (`manual` \| `finca` \| `market`), `readOnly`.

Cloud: tablas `assets` + `liabilities`. Metadata extra en `notes` como `FYM1:{...}` (`src/lib/fymMeta.ts`) hasta aplicar la migración jsonb.

**Nunca** mapear `type=real_estate` a vehicles. `institution='finca'` marca origen Finca.

## Sync Finca

`POST /api/sync-finca` con Bearer JWT de Supabase. Lee `FINCA_DATABASE_URL` (o `~/.finca-db.env` en local) y llama `patrimonio_macro_snapshot()`. Upsert de `assets` con `id` = uuid de la propiedad Finca.

## Convenciones

- Importes UI en EUR, locale `es-ES` (`formatEur`).
- Autonomía (legado) = `(líquido − deudas) / gastos mensuales`. Líquido = cash + stocks + crypto.
- Colchón de emergencia = efectivo `job=emergency` (si nadie está tagged, el efectivo no aparcado). Nunca fondos ni cripto.
- Efectivo: `emergency` (colchón, puede remunerar) | `parked` (apartado con motivo: reforma, juicio…) | el resto a fondos. TAE no es invertirlo.
- Inversión = `type=etf|stock` (nunca `other`). Extra: assetType, isin/ticker, region, assetClass, broker. Sin ticker/ISIN no se identifica.
- Inmuebles: valor **y** `ttmNetCashflow` (neto 12 meses). El alquiler contratado es bruto, no caja.
- Diagnóstico: `diagnoseWealth()` en la app y `patrimonio_ia()→diagnosis` en SQL. Mismo criterio.
- No hay tracker en tiempo real. Fondos = valor al abrir. `diagnosis.moves`: leave / deploy / operate / pay_down / divest.
- Mezcla (`diagnosis.mix`): ladrillo alto no implica vender. Si el efectivo aguanta un parón de alquiler, equilibra con fondos. Vender solo si el golpe no se cubre; candidatos = vacíos.
- Inmuebles Finca no se editan ni se borran desde el formulario; se regeneran en el sync.
- Al cargar, nube y local se fusionan (`updatedAt`); lo local más nuevo o solo-local se sube. Un deploy no puede borrar inversiones.
- Tras cada commit: `git push`. Merge a `main` solo con build+test verdes.

## Limitaciones

- Sin `~/.fuckyoumoney-db.env` Grok no lee cuentas/deudas/fondos desde SQL (sí el inmobiliario vía Finca).
- Principal hipotecario no viene de Finca.
- OAuth/password de la app no se prueba desde el agente.
